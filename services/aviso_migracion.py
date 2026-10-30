# services/aviso_migracion.py — avisa a los migrados de EasyFit que su paquete termina y que elijan un plan de Navy.
# Solo paquetes Legacy (los Founding se renuevan con su link). 7 días antes, 1 día antes y el día que vence.
# Cada aviso se manda una sola vez (tabla avisos_migracion).
import os, httpx
from datetime import date, datetime, timedelta, timezone
from services.supabase import supabase
from services.stripe_activacion import push_cliente

CDMX = timezone(timedelta(hours=-6))
MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
HITOS = {7: "7_dias", 1: "1_dia", 0: "hoy"}


def _fecha(d: date) -> str:
  return f"{d.day} de {MESES[d.month - 1]}"


def _textos(hito: str, fin: date, plan: str) -> tuple[str, str]:
  f = _fecha(fin)
  if hito == "hoy":
    return ("Hoy termina tu paquete de EasyFit",
            f"Tu {plan} termina hoy. Elige tu plan de Navy en la app para seguir reservando tus clases.")
  if hito == "1_dia":
    return ("Mañana termina tu paquete de EasyFit",
            f"Tu {plan} termina mañana, {f}. Elige tu plan de Navy en la app para seguir entrenando sin interrupciones.")
  return ("Tu paquete de EasyFit termina pronto",
          f"Tu {plan} termina el {f}. Desde ahora tus planes son de Navy: elige el tuyo en la app para seguir entrenando sin interrupciones.")


def _correo_html(nombre: str, titulo: str, texto: str, fin: date) -> str:
  return f"""<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background:#171B24;border-radius:24px;">
<tr><td style="padding:44px 44px 12px;text-align:center;">
  <img src="https://crm.navytrainingcenter.com/email/logo-navy.png" alt="NAVY" width="120" style="display:block;margin:0 auto 24px;filter:brightness(0) invert(1);">
  <p style="color:#f1f5f9;font-size:24px;font-weight:900;margin:0 0 10px;">{titulo}</p>
  <p style="color:#94a3b8;font-size:15px;line-height:23px;margin:0;">Hola {nombre}, {texto[0].lower() + texto[1:]}</p>
</td></tr>
<tr><td style="padding:24px 44px;">
  <table width="100%" style="background:rgba(255,255,255,0.05);border:1px solid #1e293b;border-radius:16px;"><tr><td style="padding:18px 22px;">
    <p style="color:#64748b;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 4px;">Tu paquete actual termina</p>
    <p style="color:#f1f5f9;font-size:20px;font-weight:900;margin:0;">{_fecha(fin).capitalize()}</p>
  </td></tr></table>
  <p style="color:#94a3b8;font-size:14px;line-height:22px;margin:22px 0 6px;"><b style="color:#e2e8f0;">¿Cómo elijo mi plan?</b></p>
  <p style="color:#94a3b8;font-size:14px;line-height:22px;margin:0;">1. Abre la app de Navy (o descárgala) y entra con este mismo correo.<br>2. Ve a <b style="color:#e2e8f0;">Perfil → Comprar plan</b> y elige el que más te convenga.<br>3. Paga con tu tarjeta y listo: tu plan empieza cuando termine el actual.</p>
  <p style="color:#64748b;font-size:13px;line-height:20px;margin:18px 0 0;">¿Dudas? Pregunta en recepción, con gusto te ayudamos.</p>
</td></tr>
<tr><td style="padding:20px 44px 36px;text-align:center;"><p style="color:#334155;font-size:10px;letter-spacing:2px;text-transform:uppercase;margin:0;">Navy Training Center · navytrainingcenter.com</p></td></tr>
</table></td></tr></table></body></html>"""


async def avisar_vencimientos_migracion(solo_ver: bool = False) -> dict:
  hoy = datetime.now(CDMX).date()
  objetivo = {(hoy + timedelta(days=d)).isoformat(): h for d, h in HITOS.items()}
  membs = supabase.table("membresias").select(
    "id, cliente_id, fecha_fin, paquetes(nombre, es_recurrente), clientes(nombre_completo, email)"
  ).eq("origen", "Migración EasyFit").eq("estatus", "Activa").in_("fecha_fin", list(objetivo)).execute().data or []

  ya = {(a["membresia_id"], a["hito"]) for a in (supabase.table("avisos_migracion").select("membresia_id, hito")
        .in_("membresia_id", [m["id"] for m in membs] or ["00000000-0000-0000-0000-000000000000"]).execute().data or [])}
  enviados, lista = 0, []
  for m in membs:
    paq = m.get("paquetes") or {}
    if paq.get("es_recurrente"):          # Founding: se renuevan con su link, no se les avisa así
      continue
    hito = objetivo[m["fecha_fin"][:10]]
    if (m["id"], hito) in ya:
      continue
    cli = m.get("clientes") or {}
    # Si ya compró su plan de Navy (otra membresía activa que no es de la migración), no se le avisa
    otro = supabase.table("membresias").select("id").eq("cliente_id", m["cliente_id"]).eq("estatus", "Activa")\
      .neq("origen", "Migración EasyFit").gte("fecha_fin", hoy.isoformat()).limit(1).execute().data
    if otro:
      continue
    fin = date.fromisoformat(m["fecha_fin"][:10])
    plan = (paq.get("nombre") or "paquete").replace("Legacy Interlomas · ", "paquete ")
    titulo, texto = _textos(hito, fin, plan)
    lista.append({"cliente": cli.get("nombre_completo"), "email": cli.get("email"), "vence": m["fecha_fin"][:10], "aviso": hito})
    if solo_ver:
      continue

    push_ok = correo_ok = False
    try:
      await push_cliente(m["cliente_id"], titulo, texto, {"tipo": "elegir_plan", "membresia_id": m["id"]})
      push_ok = True
    except Exception as e:
      print("aviso migración push:", e)
    if cli.get("email"):
      try:
        async with httpx.AsyncClient(timeout=15) as c:
          r = await c.post("https://api.resend.com/emails",
                           headers={"Authorization": f"Bearer {os.getenv('RESEND_API_KEY')}", "Content-Type": "application/json"},
                           json={"from": "Navy Training Center <noreply@navytrainingcenter.com>", "to": cli["email"],
                                 "subject": titulo, "html": _correo_html((cli.get('nombre_completo') or '').split(' ')[0] or 'hola', titulo, texto, fin)})
          correo_ok = r.status_code < 300
      except Exception as e:
        print("aviso migración correo:", e)
    supabase.table("avisos_migracion").insert({"membresia_id": m["id"], "hito": hito, "cliente_id": m["cliente_id"],
                                                "push": push_ok, "correo": correo_ok}).execute()
    enviados += 1

  print(f"📣 Avisos de vencimiento EasyFit: {enviados} enviados ({'vista previa' if solo_ver else 'reales'}: {len(lista)})")
  return {"enviados": enviados, "lista": lista}