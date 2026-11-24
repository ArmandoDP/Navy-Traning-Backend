"""
routers/cambio_coach.py — Cambio de coach de una clase, con motivo y aviso por correo.
Solo Dirección y Managers (un Manager, solo en sus sucursales).

  GET  /cambio-coach/{clase_id}/opciones   coaches que pueden cubrir (libres primero) e historial de cambios
  POST /cambio-coach/{clase_id}            hace el cambio: actualiza la clase, guarda el motivo
                                           (de ahí sale la suplencia en la quincena) y avisa a los dos coaches

Registrar en main.py:
  from routers.cambio_coach import router as cambio_coach_router
  app.include_router(cambio_coach_router, prefix="/cambio-coach")
"""
import os
from datetime import timedelta
import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from services.supabase import supabase
from routers.checador import _staff, _es_admin, _sucursales_de, _ahora, _dt, CDMX

router = APIRouter()

MOTIVOS = ["Enfermedad", "Cambio de horario", "Cobertura", "Ausencia", "Otro"]
RESEND_KEY = os.getenv("RESEND_API_KEY")
RESEND_FROM = os.getenv("RESEND_FROM")
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def _operador(request: Request) -> dict:
  s = _staff(request)
  if not (_es_admin(s) or (s.get("rol") or "").lower() == "gerente"):
    raise HTTPException(status_code=403, detail="Solo Dirección y Managers pueden cambiar el coach.")
  return s


def _clase(clase_id: str, s: dict) -> dict:
  fila = supabase.table("clases")\
    .select("id, nombre_clase, horario, duracion_minutos, sucursal_id, coach_id, estado, sucursales(nombre)")\
    .eq("id", clase_id).limit(1).execute().data
  if not fila:
    raise HTTPException(status_code=404, detail="No existe esa clase.")
  c = fila[0]
  if not _es_admin(s) and c["sucursal_id"] not in _sucursales_de(s):
    raise HTTPException(status_code=403, detail="Esta clase no es de tus sucursales.")
  return c


def _nombre(st: dict | None) -> str:
  st = st or {}
  return f"{st.get('nombre') or ''} {st.get('primer_apellido') or ''}".strip()


def _cuando(c: dict) -> str:
  h = _dt(c["horario"]).astimezone(CDMX)
  return f"{DIAS[h.weekday()]} {h.day} de {MESES[h.month - 1]}, {h.strftime('%H:%M')}"


def _quincena_cerrada(c: dict) -> bool:
  d = _dt(c["horario"]).astimezone(CDMX).date()
  inicio = d.replace(day=1 if d.day <= 15 else 16).isoformat()
  fila = supabase.table("quincenas").select("estado").eq("inicio", inicio).limit(1).execute().data
  return bool(fila and fila[0]["estado"] == "cerrada")


def _ocupados(c: dict) -> set:
  """Coaches que ya tienen otra clase que se empalma con esta."""
  ini = _dt(c["horario"])
  fin = ini + timedelta(minutes=c.get("duracion_minutos") or 60)
  cerca = supabase.table("clases").select("id, coach_id, horario, duracion_minutos")\
    .gte("horario", (ini - timedelta(hours=3)).isoformat()).lt("horario", fin.isoformat())\
    .neq("estado", "Cancelada").neq("id", c["id"]).not_.is_("coach_id", "null").execute().data or []
  ocupados = set()
  for x in cerca:
    xi = _dt(x["horario"])
    xf = xi + timedelta(minutes=x.get("duracion_minutos") or 60)
    if xi < fin and xf > ini:
      ocupados.add(x["coach_id"])
  return ocupados


@router.get("/{clase_id}/opciones")
async def opciones(clase_id: str, request: Request):
  s = _operador(request)
  c = _clase(clase_id, s)
  coaches = supabase.table("staff")\
    .select("id, nombre, primer_apellido, nivel, email, staff_sucursales(sucursal_id), sucursal_asignada_id")\
    .eq("tipo", "Coach").eq("estatus", "Activo").order("nombre").execute().data or []
  ocupados = _ocupados(c)
  lista = []
  for x in coaches:
    if x["id"] == c.get("coach_id"):
      continue
    sucs = {y["sucursal_id"] for y in x.get("staff_sucursales") or []} | {x.get("sucursal_asignada_id")}
    lista.append({"id": x["id"], "nombre": _nombre(x), "nivel": x.get("nivel"), "tiene_correo": bool(x.get("email")),
                  "de_la_sucursal": c["sucursal_id"] in sucs, "ocupado": x["id"] in ocupados})
  lista.sort(key=lambda x: (x["ocupado"], not x["de_la_sucursal"], x["nombre"]))
  # Sin "embeds": hecho_por no tiene llave foránea, así que los nombres se buscan aparte
  historial = supabase.table("cambios_coach").select("motivo, detalle, created_at, coach_antes, coach_despues, hecho_por")\
    .eq("clase_id", clase_id).order("created_at", desc=True).execute().data or []
  ids = {h[k] for h in historial for k in ("coach_antes", "coach_despues", "hecho_por") if h.get(k)}
  nombres = {x["id"]: x for x in (supabase.table("staff").select("id, nombre, primer_apellido").in_("id", list(ids)).execute().data or [])} if ids else {}
  return {
    "clase": {"nombre": (c.get("nombre_clase") or "").strip(), "cuando": _cuando(c),
              "sucursal": (c.get("sucursales") or {}).get("nombre"), "coach_id": c.get("coach_id")},
    "motivos": MOTIVOS, "coaches": lista,
    "historial": [{"motivo": h["motivo"], "detalle": h.get("detalle"), "fecha": h["created_at"],
                   "antes": _nombre(nombres.get(h.get("coach_antes"))) or "Sin coach",
                   "despues": _nombre(nombres.get(h.get("coach_despues"))),
                   "quien": _nombre(nombres.get(h.get("hecho_por")))} for h in historial],
    "quincena_cerrada": _quincena_cerrada(c),
  }


class CambioIn(BaseModel):
  coach_id: str
  motivo: str
  detalle: str | None = None
  avisar: bool = True
  forzar: bool = False          # cambiar aunque el coach nuevo tenga otra clase a esa hora


def _correo(para: str, asunto: str, titulo: str, parrafos: list[str], c: dict) -> bool:
  if not (RESEND_KEY and RESEND_FROM and para):
    return False
  cuerpo = "".join(f'<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#374151">{p}</p>' for p in parrafos)
  html = f"""<!doctype html><html><body style="margin:0;background:#F4F5F7;font-family:Segoe UI,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden">
    <tr><td style="background:#171B24;padding:26px 28px;color:#ffffff">
      <div style="font-size:12px;letter-spacing:.18em;color:rgba(255,255,255,.55);font-weight:700">NAVY TRAINING CENTER</div>
      <div style="font-size:22px;font-weight:900;margin-top:8px">{titulo}</div>
    </td></tr>
    <tr><td style="padding:26px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;border-radius:14px;margin-bottom:18px"><tr><td style="padding:16px 18px">
        <div style="font-size:17px;font-weight:900;color:#111827">{(c.get('nombre_clase') or '').strip()}</div>
        <div style="font-size:14px;color:#6B7280;margin-top:4px">{_cuando(c).capitalize()} · {c.get('duracion_minutos') or 60} min · {(c.get('sucursales') or {}).get('nombre') or ''}</div>
      </td></tr></table>
      {cuerpo}
      <p style="margin:18px 0 0;font-size:12px;color:#9CA3AF">Este aviso se envió automáticamente desde el CRM de Navy.</p>
    </td></tr>
  </table></td></tr></table></body></html>"""
  try:
    r = httpx.post("https://api.resend.com/emails", timeout=15,
                   headers={"Authorization": f"Bearer {RESEND_KEY}", "Content-Type": "application/json"},
                   json={"from": RESEND_FROM, "to": [para], "subject": asunto, "html": html})
    return r.status_code < 300
  except Exception as e:
    print(f"Correo de cambio de coach a {para} falló: {e}")
    return False


@router.post("/{clase_id}")
async def cambiar(clase_id: str, body: CambioIn, request: Request):
  s = _operador(request)
  c = _clase(clase_id, s)
  if c.get("estado") == "Cancelada":
    raise HTTPException(status_code=400, detail="La clase está cancelada.")
  if body.motivo not in MOTIVOS:
    raise HTTPException(status_code=400, detail="Elige un motivo.")
  if body.motivo == "Otro" and not (body.detalle or "").strip():
    raise HTTPException(status_code=400, detail='Con "Otro", escribe el motivo.')
  if body.coach_id == c.get("coach_id"):
    raise HTTPException(status_code=400, detail="Ese coach ya tiene la clase.")
  if _quincena_cerrada(c):
    raise HTTPException(status_code=400, detail="La quincena de esta clase ya está cerrada: no se puede cambiar el coach.")
  nuevo = supabase.table("staff").select("id, nombre, primer_apellido, email, estatus, tipo")\
    .eq("id", body.coach_id).limit(1).execute().data
  if not nuevo or (nuevo[0].get("estatus") or "Activo") != "Activo":
    raise HTTPException(status_code=400, detail="Ese coach no existe o está inactivo.")
  nuevo = nuevo[0]
  if body.coach_id in _ocupados(c) and not body.forzar:
    raise HTTPException(status_code=409, detail=f"{_nombre(nuevo)} ya tiene otra clase a esa hora.")
  antes = None
  if c.get("coach_id"):
    f = supabase.table("staff").select("id, nombre, primer_apellido, email").eq("id", c["coach_id"]).limit(1).execute().data
    antes = f[0] if f else None

  ahora = _ahora()
  mismo_dia = _dt(c["horario"]).astimezone(CDMX).date() == ahora.astimezone(CDMX).date()
  supabase.table("clases").update({"coach_id": body.coach_id, "instructor": _nombre(nuevo)}).eq("id", clase_id).execute()
  cambio = supabase.table("cambios_coach").insert({
    "clase_id": clase_id, "coach_antes": c.get("coach_id"), "coach_despues": body.coach_id,
    "motivo": body.motivo, "detalle": (body.detalle or "").strip() or None,
    "mismo_dia": mismo_dia, "hecho_por": s["id"],
  }).execute().data[0]

  # Si la clase ya se evaluó para pago y nadie la resolvió a mano, se recalcula con el coach nuevo
  imp = supabase.table("clases_impartidas").select("id, resuelto_por").eq("clase_id", clase_id).limit(1).execute().data
  if imp and not imp[0].get("resuelto_por"):
    try:
      from routers.checador import _evaluar_clase
      cl = supabase.table("clases").select("id, coach_id, sucursal_id, horario, duracion_minutos, nombre_clase, tipo_clase, estado, capacidad_max")\
        .eq("id", clase_id).single().execute().data
      supabase.table("clases_impartidas").upsert(_evaluar_clase(cl), on_conflict="clase_id").execute()
    except Exception as e:
      print(f"Recalcular clase {clase_id} tras cambio de coach: {e}")

  # Avisos por correo
  enviados = []
  futura = _dt(c["horario"]) > ahora
  if body.avisar and futura:
    motivo = body.motivo if body.motivo != "Otro" else (body.detalle or "").strip()
    quien = _nombre(s)
    if _correo(nuevo.get("email"), f"Te asignaron una clase: {(c.get('nombre_clase') or '').strip()} · {_cuando(c)}",
               f"Hola, {nuevo.get('nombre') or ''}: tienes una clase nueva",
               [f"{quien} te asignó esta clase{f' en lugar de {_nombre(antes)}' if antes else ''}.",
                f"Motivo: <b>{motivo}</b>.", "La verás en tu checador y en la app. Recuerda checar tu entrada con el QR de Front Desk."], c):
      enviados.append(_nombre(nuevo))
    if antes and _correo(antes.get("email"), f"Ya no tienes esta clase: {(c.get('nombre_clase') or '').strip()} · {_cuando(c)}",
                         f"Hola, {antes.get('nombre') or ''}: cambió tu clase",
                         [f"Esta clase ahora la da <b>{_nombre(nuevo)}</b>.", f"Motivo: <b>{motivo}</b>.",
                          "Si crees que es un error, avísale a tu Manager."], c):
      enviados.append(_nombre(antes))
    if enviados:
      supabase.table("cambios_coach").update({"notificado_at": ahora.isoformat()}).eq("id", cambio["id"]).execute()

  return {"ok": True, "coach": _nombre(nuevo), "antes": _nombre(antes) if antes else None,
          "avisados": enviados, "suplencia": bool(antes), "mismo_dia": mismo_dia}