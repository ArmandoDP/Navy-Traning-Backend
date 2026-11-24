"""
routers/fitpass.py — Lugares para Fitpass en las clases.

Un lugar de Fitpass es una reserva con origen "Fitpass" y SIN cliente todavía. Así la app, Wellhub,
TotalPass, la lista de espera y la ocupación del CRM lo cuentan como ocupado sin cambiar nada de su lógica.
Cuando la persona de Fitpass llega a recepción, se le asigna el lugar (y se da de alta como cliente
con origen Fitpass, para que cuente su asistencia y aparezca en Clientes y en Prospectos).
Los lugares NO se liberan solos.

  POST /fitpass/apartar      {clase_id, lugares}                 deja la clase con N lugares de Fitpass
  POST /fitpass/asignar      {reserva_id, cliente_id | nombre+telefono [+email, codigo], llegada}
  POST /fitpass/desasignar   {reserva_id}                        regresa el lugar a "apartado" (por error de captura)

Registrar en main.py:
  from routers.fitpass import router as fitpass_router
  app.include_router(fitpass_router, prefix="/fitpass")
"""
import re
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from services.supabase import supabase
from services.auth_app import staff_de_sesion
from routers.sincronizacion import sincronizar_cupos

router = APIRouter()
ORIGEN = "Fitpass"
ETIQUETA = "Lugar Fitpass"
ROLES = {"direccion", "gerente", "staff_navy", "admin", "super_admin"}


def _staff(request: Request) -> dict:
  s = staff_de_sesion(request)
  if (s.get("rol") or "").lower() not in ROLES:
    raise HTTPException(status_code=403, detail="No tienes permiso para manejar lugares de Fitpass.")
  return s


def _clase(clase_id: str) -> dict:
  c = supabase.table("clases").select("id, nombre_clase, horario, capacidad_max, estado, sucursal_id, room_id, coach_id")\
    .eq("id", clase_id).limit(1).execute().data
  if not c:
    raise HTTPException(status_code=404, detail="Clase no encontrada.")
  if c[0].get("estado") not in (None, "Activa"):
    raise HTTPException(status_code=400, detail="La clase no está activa.")
  return c[0]


def _activas(clase_id: str) -> list[dict]:
  return supabase.table("reservas").select("id, cliente_id, origen, estatus, spot_id, lista_espera, created_at")\
    .eq("clase_id", clase_id).neq("estatus", "Cancelada").execute().data or []


def _lugares_libres(clase: dict, ocupadas: list[dict]) -> list[str]:
  """Lugares del room que nadie tiene, del último al primero (los de Fitpass van al final)."""
  if not clase.get("room_id"):
    return []
  spots = supabase.table("room_spots").select("id, numero, bloqueado").eq("room_id", clase["room_id"])\
    .order("numero", desc=True).execute().data or []
  usados = {r["spot_id"] for r in ocupadas if r.get("spot_id")}
  # Lugares que el CRM guardó en la tabla spots (reservas hechas desde recepción)
  try:
    numeros_crm = {s["numero"] for s in supabase.table("spots").select("numero").eq("clase_id", clase["id"]).execute().data or []}
  except Exception:
    numeros_crm = set()
  return [s["id"] for s in spots if not s.get("bloqueado") and s["id"] not in usados and s["numero"] not in numeros_crm]


# ── Apartar ───────────────────────────────────────────────────────────────────
class ApartarIn(BaseModel):
  clase_id: str
  lugares: int


@router.post("/apartar")
async def apartar(body: ApartarIn, request: Request):
  _staff(request)
  if body.lugares < 0 or body.lugares > 50:
    raise HTTPException(status_code=400, detail="Número de lugares inválido.")
  clase = _clase(body.clase_id)
  activas = _activas(clase["id"])
  fitpass = [r for r in activas if (r.get("origen") or "") == ORIGEN]
  libres_fp = [r for r in fitpass if not r.get("cliente_id")]
  ocupadas = [r for r in activas if not r.get("lista_espera")]
  cupo = clase.get("capacidad_max") or 0

  if body.lugares > len(fitpass):
    faltan = body.lugares - len(fitpass)
    disponibles = cupo - len(ocupadas)
    if faltan > disponibles:
      raise HTTPException(status_code=400, detail=f"Solo quedan {max(disponibles, 0)} lugares libres en la clase.")
    spots = _lugares_libres(clase, ocupadas)
    nuevas = [{
      "clase_id": clase["id"], "cliente_id": None, "estatus": "Confirmada", "origen": ORIGEN,
      "nombre_externo": ETIQUETA, "spot_id": spots[i] if i < len(spots) else None,
    } for i in range(faltan)]
    supabase.table("reservas").insert(nuevas).execute()
  elif body.lugares < len(fitpass):
    quitar = len(fitpass) - body.lugares
    if quitar > len(libres_fp):
      raise HTTPException(status_code=400, detail=f"Ya hay {len(fitpass) - len(libres_fp)} lugares de Fitpass asignados: no se pueden quitar.")
    # Se quitan los apartados más recientes (sin asignar)
    for r in sorted(libres_fp, key=lambda x: x["created_at"], reverse=True)[:quitar]:
      supabase.table("reservas").update({"estatus": "Cancelada"}).eq("id", r["id"]).execute()

  sync = await sincronizar_cupos(clase["id"])
  return {"ok": True, "lugares": body.lugares, "cupos": {"total": sync.get("total"), "capacidad": sync.get("capacidad")}}


# ── Asignar ───────────────────────────────────────────────────────────────────
class AsignarIn(BaseModel):
  reserva_id: str
  cliente_id: str | None = None
  nombre: str | None = None
  telefono: str | None = None
  email: str | None = None
  codigo: str | None = None
  llegada: bool = True


def _cliente_fitpass(body: AsignarIn, clase: dict) -> dict:
  """Usa al cliente elegido, o lo busca por correo/teléfono, o lo da de alta con origen Fitpass."""
  if body.cliente_id:
    c = supabase.table("clientes").select("id, nombre_completo, email").eq("id", body.cliente_id).limit(1).execute().data
    if not c:
      raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    return c[0]
  nombre = (body.nombre or "").strip()
  tel = re.sub(r"\D", "", body.telefono or "")
  email = (body.email or "").strip().lower() or None
  if len(nombre) < 3:
    raise HTTPException(status_code=400, detail="Escribe su nombre.")
  if len(tel) < 10:
    raise HTTPException(status_code=400, detail="Escribe un teléfono de 10 dígitos.")
  if email and not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
    raise HTTPException(status_code=400, detail="El correo no es válido.")
  # ¿Ya existe? (por correo o por teléfono)
  if email:
    ya = supabase.table("clientes").select("id, nombre_completo, email").ilike("email", email).limit(1).execute().data
    if ya:
      return ya[0]
  ya = supabase.table("clientes").select("id, nombre_completo, email, telefono").ilike("telefono", f"%{tel[-10:]}").limit(1).execute().data
  if ya:
    return ya[0]
  nuevo = supabase.table("clientes").insert({
    "nombre_completo": nombre, "telefono": tel[-10:], "email": email, "estatus": "Activo", "plan": "Fitpass",
    "origen": ORIGEN, "origen_detalle": f"Fitpass{f' · código {body.codigo.strip()}' if (body.codigo or '').strip() else ''}",
    "sucursal_id": clase.get("sucursal_id"),
  }).execute().data
  return nuevo[0]


@router.post("/asignar")
async def asignar(body: AsignarIn, request: Request):
  s = _staff(request)
  fila = supabase.table("reservas").select("id, clase_id, cliente_id, origen, estatus").eq("id", body.reserva_id).limit(1).execute().data
  if not fila or (fila[0].get("origen") or "") != ORIGEN or fila[0]["estatus"] == "Cancelada":
    raise HTTPException(status_code=404, detail="Ese lugar de Fitpass ya no existe.")
  r = fila[0]
  if r.get("cliente_id"):
    raise HTTPException(status_code=400, detail="Ese lugar ya está asignado.")
  clase = _clase(r["clase_id"])
  cliente = _cliente_fitpass(body, clase)

  otra = supabase.table("reservas").select("id").eq("clase_id", clase["id"]).eq("cliente_id", cliente["id"])\
    .neq("estatus", "Cancelada").limit(1).execute().data
  if otra:
    raise HTTPException(status_code=400, detail=f"{cliente['nombre_completo']} ya tiene lugar en esta clase.")

  ahora = datetime.now(timezone.utc).isoformat()
  supabase.table("reservas").update({
    "cliente_id": cliente["id"], "nombre_externo": None,
    "estatus": "Asistió" if body.llegada else "Confirmada",
  }).eq("id", r["id"]).execute()
  if body.llegada:
    supabase.table("asistencias").insert({
      "cliente_id": cliente["id"], "clase_id": clase["id"], "fecha_checkin": ahora,
      "sucursal_id": clase.get("sucursal_id"), "staff_id": clase.get("coach_id"), "es_clase_muestra": False,
    }).execute()
  try:
    supabase.table("actividad_log").insert({
      "tipo": "fitpass_asignado", "tabla": "reservas", "accion": "UPDATE", "staff_id": s.get("id"),
      "sucursal_id": clase.get("sucursal_id"),
      "descripcion": f"{s.get('nombre', '')} asignó un lugar de Fitpass a {cliente['nombre_completo']} en {(clase.get('nombre_clase') or '').strip()}",
      "metadata": {"reserva_id": r["id"], "cliente_id": cliente["id"], "clase_id": clase["id"], "llegada": body.llegada},
    }).execute()
  except Exception as e:
    print(f"actividad_log fitpass: {e}")

  # El correo con su QR se conecta con el servicio de confirmación de reservas (pendiente)
  return {"ok": True, "cliente": {"id": cliente["id"], "nombre": cliente["nombre_completo"], "email": cliente.get("email")},
          "llegada": body.llegada}


class DesasignarIn(BaseModel):
  reserva_id: str


@router.post("/desasignar")
async def desasignar(body: DesasignarIn, request: Request):
  _staff(request)
  fila = supabase.table("reservas").select("id, clase_id, cliente_id, origen").eq("id", body.reserva_id).limit(1).execute().data
  if not fila or (fila[0].get("origen") or "") != ORIGEN or not fila[0].get("cliente_id"):
    raise HTTPException(status_code=400, detail="Ese lugar no está asignado.")
  r = fila[0]
  supabase.table("asistencias").delete().eq("clase_id", r["clase_id"]).eq("cliente_id", r["cliente_id"]).execute()
  supabase.table("reservas").update({"cliente_id": None, "nombre_externo": ETIQUETA, "estatus": "Confirmada"}).eq("id", r["id"]).execute()
  return {"ok": True}