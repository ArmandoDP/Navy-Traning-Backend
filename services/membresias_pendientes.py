# services/membresias_pendientes.py
# Membresías en espera de su primera reserva: Stripe, activación automática y recordatorios.
import os
import httpx
import stripe
from datetime import date, datetime, time, timedelta, timezone
from services.supabase           import supabase
from services                    import stripe_service  # noqa: F401  (configura la llave y versión de Stripe)
from services.stripe_activacion  import push_cliente, CDMX, hoy_cdmx

DIAS_MAX_ACTIVACION = int(os.getenv("DIAS_MAX_ACTIVACION", "30"))   # igual que navy_dias_max_activacion() en SQL
DIAS_AVISO          = {1, 3, 7, 14, 21}
DIAS_NOMBRE = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def _ts(fecha: str) -> int:
  return int(datetime.combine(date.fromisoformat(fecha), time.min, tzinfo=CDMX).timestamp())


# ─── 1. Que Stripe cobre la renovación hasta que termine el periodo real ─────
async def sincronizar_stripe_membresias():
  r = supabase.table("membresias").select("id, fecha_fin, stripe_subscription_id")\
    .eq("stripe_sincronizada", False).eq("estatus", "Activa")\
    .not_.is_("stripe_subscription_id", "null").limit(50).execute()
  for m in (r.data or []):
    fin = _ts(m["fecha_fin"])
    try:
      if fin > datetime.now(timezone.utc).timestamp() + 3600:
        stripe.Subscription.modify(m["stripe_subscription_id"], trial_end=fin, proration_behavior="none")
        print(f"🗓  Stripe: siguiente cobro de {m['stripe_subscription_id']} movido al {m['fecha_fin']}")
      supabase.table("membresias").update({"stripe_sincronizada": True}).eq("id", m["id"]).execute()
    except stripe.error.InvalidRequestError as e:
      # Suscripción cancelada o inexistente: no hay nada que mover
      print(f"Stripe {m['stripe_subscription_id']}: {e.user_message or e}")
      supabase.table("membresias").update({"stripe_sincronizada": True}).eq("id", m["id"]).execute()
    except Exception as e:
      print("Error sincronizando Stripe:", e)


# ─── 2. Activar las que llevan demasiado tiempo en espera ───────────────────
async def activar_membresias_por_tiempo():
  limite = (hoy_cdmx() - timedelta(days=DIAS_MAX_ACTIVACION)).isoformat()
  r = supabase.table("membresias").select("id, cliente_id, fecha_fin, paquetes(nombre)")\
    .eq("activacion_pendiente", True).eq("estatus", "Activa").lte("fecha_compra", limite).execute()
  for m in (r.data or []):
    supabase.table("membresias").update({
      "activacion_pendiente": False,
      "activada_at":          datetime.now(timezone.utc).isoformat(),
      "fecha_inicio":         hoy_cdmx().isoformat(),
    }).eq("id", m["id"]).execute()
    nombre = (m.get("paquetes") or {}).get("nombre", "tu plan")
    fin = date.fromisoformat(m["fecha_fin"]).strftime("%d/%m/%Y")
    await push_cliente(m["cliente_id"], "Tu plan ya está activo 💪",
      f"{nombre} está vigente hasta el {fin}. ¡Reserva tu primera clase!", {"tipo": "plan_activado"})
    print(f"⏰ Membresía {m['id']} activada por tiempo")


# ─── 3. Invitar a reservar a quien pagó y no ha estrenado ───────────────────
def _clases_sugeridas(sucursal_id: str | None) -> list[dict]:
  if not sucursal_id:
    return []
  ahora = datetime.now(timezone.utc)
  r = supabase.table("clases").select("nombre_clase, horario, capacidad_max, espacios_ocupados")\
    .eq("sucursal_id", sucursal_id).eq("estado", "Activa")\
    .gte("horario", (ahora + timedelta(hours=3)).isoformat())\
    .lte("horario", (ahora + timedelta(days=3)).isoformat()).limit(200).execute()
  sugeridas = []
  for c in (r.data or []):
    nombre = (c.get("nombre_clase") or "").strip()
    cap, ocup = c.get("capacidad_max") or 0, c.get("espacios_ocupados") or 0
    if "OPEN GYM" in nombre.upper() or cap <= 0 or ocup >= cap:
      continue
    sugeridas.append({**c, "nombre": nombre, "libres": cap - ocup, "llenado": ocup / cap})
  sugeridas.sort(key=lambda x: x["llenado"], reverse=True)
  return sugeridas[:3]


def _cuando(horario: str) -> str:
  d = datetime.fromisoformat(horario.replace("Z", "+00:00")).astimezone(CDMX)
  dia = "hoy" if d.date() == hoy_cdmx() else ("mañana" if d.date() == hoy_cdmx() + timedelta(days=1) else DIAS_NOMBRE[d.weekday()])
  return f"{dia} {d.strftime('%H:%M')}"


def _correo_html(nombre1: str, plan: str, sugeridas: list[dict], dias_para_auto: int) -> str:
  filas = "".join(
    f"""<tr><td style="padding:12px 0;border-bottom:1px solid #1e3a5f;color:#e2e8f0;font-size:14px;font-weight:700">{c['nombre']}</td>
        <td style="padding:12px 0;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:13px">{_cuando(c['horario'])}</td>
        <td align="right" style="padding:12px 0;border-bottom:1px solid #1e3a5f;color:{'#f59e0b' if c['libres'] <= 3 else '#22c55e'};font-size:13px;font-weight:700">
        {'¡Últimos ' + str(c['libres']) + '!' if c['libres'] <= 3 else str(c['libres']) + ' lugares'}</td></tr>"""
    for c in sugeridas)
  tabla = f"""<p style="color:#94a3b8;font-size:13px;margin:28px 0 8px;letter-spacing:2px;text-transform:uppercase;font-weight:700">Clases que se están llenando</p>
    <table width="100%" cellpadding="0" cellspacing="0">{filas}</table>""" if sugeridas else ""
  return f"""<!DOCTYPE html><html lang="es"><body style="margin:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a"><tr><td align="center" style="padding:32px 12px">
<table width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px">
  <tr><td style="background:#171B24;border-radius:28px 28px 0 0;padding:44px 48px 28px;text-align:center">
    <img src="https://crm.navytrainingcenter.com/email/logo-navy.png" alt="NAVY" width="140" style="display:block;margin:0 auto 24px;filter:brightness(0) invert(1)">
    <p style="color:#f1f5f9;font-size:26px;font-weight:900;margin:0 0 10px">{nombre1}, tu primera clase te espera 💪</p>
    <p style="color:#94a3b8;font-size:15px;line-height:23px;margin:0">Tu plan <b style="color:#e2e8f0">{plan}</b> está listo.
    <b style="color:#22c55e">No empieza a contar hasta que reserves tu primera clase</b>, así que no pierdes ningún día.</p>
  </td></tr>
  <tr><td style="background:#171B24;padding:0 48px 36px">{tabla}
    <p style="color:#64748b;font-size:12px;line-height:19px;margin:28px 0 0">Si no reservas en los próximos {dias_para_auto} días, tu plan se activará automáticamente.
    Abre la app de Navy y elige tu clase.</p>
  </td></tr>
  <tr><td style="background:#0f172a;border-radius:0 0 28px 28px;padding:22px 48px;text-align:center">
    <p style="color:#334155;font-size:10px;margin:0;letter-spacing:2px;text-transform:uppercase">Navy Training Center</p>
  </td></tr>
</table></td></tr></table></body></html>"""


async def invitar_a_reservar():
  hoy = hoy_cdmx()
  r = supabase.table("membresias")\
    .select("id, cliente_id, fecha_compra, recordatorios_enviados, ultimo_recordatorio, "
            "paquetes(nombre), clientes(nombre_completo, email, sucursal_id)")\
    .eq("activacion_pendiente", True).eq("estatus", "Activa").execute()

  for m in (r.data or []):
    if not m.get("fecha_compra") or m.get("ultimo_recordatorio") == hoy.isoformat():
      continue
    dias = (hoy - date.fromisoformat(m["fecha_compra"])).days
    dias_para_auto = DIAS_MAX_ACTIVACION - dias
    if dias not in DIAS_AVISO and dias_para_auto != 3:
      continue

    cli    = m.get("clientes") or {}
    plan   = (m.get("paquetes") or {}).get("nombre", "tu plan")
    nombre1 = (cli.get("nombre_completo") or "").split()[0] if cli.get("nombre_completo") else ""
    sug    = _clases_sugeridas(cli.get("sucursal_id"))
    top    = sug[0] if sug else None

    if dias_para_auto == 3:
      titulo, cuerpo = "⏳ Tu plan se activa en 3 días", f"{plan} empezará a contar solo en 3 días. Reserva tu primera clase y aprovéchalo al máximo."
    elif top and top["libres"] <= 3:
      titulo, cuerpo = f"🔥 {top['nombre']} casi llena", f"{_cuando(top['horario'])} · quedan {top['libres']} lugares. Tu {plan} arranca cuando reserves."
    elif dias == 1:
      titulo, cuerpo = f"¡Bienvenido a Navy, {nombre1}! 💪", f"Tu {plan} empieza a contar hasta tu primera clase. Elige la tuya en la app."
    elif top:
      titulo, cuerpo = "Tu primera clase te espera", f"{top['nombre']} {_cuando(top['horario'])} · quedan {top['libres']} lugares. No pierdes días: tu plan arranca al reservar."
    else:
      titulo, cuerpo = "Tu primera clase te espera", f"Tu {plan} está listo y arranca cuando reserves. ¡Te esperamos!"

    await push_cliente(m["cliente_id"], titulo, cuerpo, {"tipo": "invita_reservar"})

    if cli.get("email") and (dias in (1, 7, 14) or dias_para_auto == 3):
      try:
        async with httpx.AsyncClient(timeout=15.0) as client:
          await client.post("https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {os.getenv('RESEND_API_KEY')}", "Content-Type": "application/json"},
            json={
              "from":    "Navy Training Center <noreply@navytrainingcenter.com>",
              "to":      cli["email"],
              "subject": f"{nombre1}, tu primera clase te espera 💪" if nombre1 else "Tu primera clase te espera 💪",
              "html":    _correo_html(nombre1 or "Hola", plan, sug, max(dias_para_auto, 0)),
            })
      except Exception as e:
        print("Error correo invitación:", e)

    supabase.table("membresias").update({
      "recordatorios_enviados": (m.get("recordatorios_enviados") or 0) + 1,
      "ultimo_recordatorio":    hoy.isoformat(),
    }).eq("id", m["id"]).execute()
    print(f"📣 Invitación a reservar: {cli.get('email')} (día {dias})")