# routers/editar_clase.py
from fastapi            import APIRouter, HTTPException, Request
from services.supabase  import supabase
from services.push      import enviar_push
from routers.sincronizacion    import sincronizar_cupos
from routers.totalpass_booking import get_booking_token, get_place_api_key, publicar_clase_totalpass
from datetime import datetime, timedelta, timezone
import httpx
import os

router = APIRouter()

WH_BASE = "https://api.partners.gympass.com/booking/v1/gyms"
TP_BASE = "https://booking-api.totalpass.com"
WELLHUB_GYMS = {
  "1b2032dc-f5da-40c6-8c4e-e227be14673b": "848637",  # Condesa Gym
  "f8f798a8-d89b-4874-a53a-cdcb6325ad2a": "848638",  # Condesa Studio
}
CDMX = timezone(timedelta(hours=-6))
MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
         'septiembre','octubre','noviembre','diciembre']


# ─── Autorización: solo dirección ────────────────────────────────────────────
async def autorizar(request: Request) -> dict:
  # Llamadas internas (scripts) con la service key
  interno = request.headers.get("x-internal-key")
  if interno and interno == os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
    return {"id": None, "nombre": "Sistema", "primer_apellido": "", "rol": "direccion"}

  auth = request.headers.get("authorization", "")
  if not auth.lower().startswith("bearer "):
    raise HTTPException(status_code=401, detail="Sesión requerida")
  try:
    user = supabase.auth.get_user(auth[7:]).user
    email = user.email
  except Exception:
    raise HTTPException(status_code=401, detail="Sesión inválida o expirada")

  st = supabase.table("staff").select("id, nombre, primer_apellido, rol, estatus")\
    .eq("email", email).limit(1).execute()
  if not st.data:
    raise HTTPException(status_code=403, detail="Usuario no es staff")
  s = st.data[0]
  if s.get("rol") != "direccion" or s.get("estatus") != "Activo":
    raise HTTPException(status_code=403, detail="Solo dirección puede editar clases")
  return s


# ─── Helpers ─────────────────────────────────────────────────────────────────
def nombre_coach(staff) -> str | None:
  s = staff[0] if isinstance(staff, list) and staff else staff
  if not s:
    return None
  n = " ".join(f"{s.get('nombre') or ''} {s.get('primer_apellido') or ''}".split())
  return n or None

def parse_dt(valor: str) -> datetime:
  return datetime.fromisoformat(valor.replace("[UTC]", "").replace("Z", "+00:00"))

def fmt_fecha_hora(iso: str) -> str:
  d = parse_dt(iso).astimezone(CDMX)
  return f"{d.day} de {MESES[d.month - 1]}, {d.strftime('%I:%M %p').lstrip('0')}"


def correo_cambio(nombre_cliente: str, clase_antes: str, clase_despues: str,
                  coach_antes: str | None, coach_despues: str | None,
                  horario: str, sucursal: str) -> str:
  nombre1 = (nombre_cliente or "").split()[0] if nombre_cliente else "hola"
  filas = ""
  if clase_antes != clase_despues:
    filas += f"""<tr><td style="padding:10px 0;border-bottom:1px solid #1e3a5f;color:#475569;font-size:13px;">Clase</td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid #1e3a5f;color:#cbd5e1;font-size:13px;">
      <span style="text-decoration:line-through;color:#64748b;">{clase_antes}</span> → <b>{clase_despues}</b></td></tr>"""
  if coach_antes != coach_despues:
    filas += f"""<tr><td style="padding:10px 0;border-bottom:1px solid #1e3a5f;color:#475569;font-size:13px;">Coach</td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid #1e3a5f;color:#cbd5e1;font-size:13px;">
      <span style="text-decoration:line-through;color:#64748b;">{coach_antes or '—'}</span> → <b>{coach_despues or '—'}</b></td></tr>"""
  return f"""<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;"><tr><td align="center" style="padding:32px 12px;">
<table width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
  <tr><td style="background:#171B24;border-radius:28px 28px 0 0;padding:44px 52px 32px;text-align:center;">
    <img src="https://crm.navytrainingcenter.com/email/logo-navy.png" alt="NAVY" width="140" style="display:block;margin:0 auto 24px;filter:brightness(0) invert(1);">
    <p style="color:#f1f5f9;font-size:24px;font-weight:900;margin:0 0 8px;">Cambio en tu clase</p>
    <p style="color:#94a3b8;font-size:14px;margin:0;">Hola {nombre1}, hubo un ajuste en una clase que tienes reservada</p>
  </td></tr>
  <tr><td style="background:#171B24;padding:12px 52px 40px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);border-radius:18px;">
      <tr><td style="padding:20px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          {filas}
          <tr><td style="padding:10px 0;border-bottom:1px solid #1e3a5f;color:#475569;font-size:13px;">Fecha y hora</td>
              <td align="right" style="padding:10px 0;border-bottom:1px solid #1e3a5f;color:#cbd5e1;font-size:13px;font-weight:700;">{fmt_fecha_hora(horario)}</td></tr>
          <tr><td style="padding:10px 0;color:#475569;font-size:13px;">Sucursal</td>
              <td align="right" style="padding:10px 0;color:#cbd5e1;font-size:13px;font-weight:700;">{sucursal}</td></tr>
        </table>
      </td></tr>
    </table>
    <p style="color:#94a3b8;font-size:13px;line-height:20px;margin:24px 0 0;">Tu lugar sigue reservado y la fecha y hora no cambian.
    Si ya no te acomoda, puedes cancelar desde la app sin que cuente como no-show.</p>
  </td></tr>
  <tr><td style="background:#0f172a;border-radius:0 0 28px 28px;padding:24px 52px;text-align:center;">
    <p style="color:#334155;font-size:10px;margin:0;letter-spacing:2px;text-transform:uppercase;">Navy Training Center · navytrainingcenter.com</p>
  </td></tr>
</table></td></tr></table></body></html>"""


async def wellhub_actualizar(client, clase: dict, cambios: dict, nuevo: dict) -> dict:
  gym = WELLHUB_GYMS.get(clase["sucursal_id"])
  cid, sid = clase.get("wellhub_class_id"), clase.get("wellhub_slot_id")
  if not (gym and cid and sid):
    return {"estado": "no publicada"}
  H = {"Authorization": f"Bearer {os.getenv('WELLHUB_API_KEY')}", "Content-Type": "application/json"}
  res = {}

  # Nombre: vive en la clase del catálogo
  if "nombre" in cambios:
    r = await client.patch(f"{WH_BASE}/{gym}/classes/{cid}", headers=H, json={"name": nuevo["nombre"]})
    res["nombre"] = r.status_code

  # Slot: capacidad, coach, horario, duración
  patch = {}
  if "capacidad_max" in cambios:
    patch["total_capacity"] = nuevo["capacidad_max"]
  if "coach" in cambios:
    patch["instructors"] = [{"name": nuevo["coach"], "substitute": False}] if nuevo["coach"] else []
  if "horario" in cambios:
    patch["occur_date"] = parse_dt(nuevo["horario"]).astimezone(CDMX).strftime("%Y-%m-%dT%H:%M:%S") + "-06:00"
  if "duracion_minutos" in cambios:
    patch["length_in_minutes"] = nuevo["duracion_minutos"]

  if patch:
    url = f"{WH_BASE}/{gym}/classes/{cid}/slots/{sid}"
    await client.patch(url, headers=H, json=patch)

    def verificar(slot: dict) -> bool:
      if "total_capacity" in patch and slot.get("total_capacity") != patch["total_capacity"]:
        return False
      if "instructors" in patch:
        nombres = [i.get("name") for i in (slot.get("instructors") or [])]
        if nuevo["coach"] and nuevo["coach"] not in nombres:
          return False
      if "occur_date" in patch and parse_dt(slot.get("occur_date", "")) != parse_dt(patch["occur_date"]):
        return False
      if "length_in_minutes" in patch and slot.get("length_in_minutes") != patch["length_in_minutes"]:
        return False
      return True

    g = await client.get(url, headers=H)
    slot = g.json() if g.status_code == 200 else {}
    ok = g.status_code == 200 and verificar(slot)

    if not ok and slot:
      # Respaldo: PUT con todos los datos del slot + cambios
      payload = {
        "occur_date":        (slot.get("occur_date") or "").replace("[UTC]", ""),
        "status":            slot.get("status", 1),
        "room":              slot.get("room") or "Studio",
        "length_in_minutes": slot.get("length_in_minutes", 60),
        "total_capacity":    slot.get("total_capacity"),
        "total_booked":      slot.get("total_booked", 0),
        "product_id":        slot.get("product_id"),
        "instructors":       slot.get("instructors") or [],
        "rate":              0,
        **patch,
      }
      await client.put(url, headers=H, json=payload)
      g = await client.get(url, headers=H)
      ok = g.status_code == 200 and verificar(g.json())

    res["slot"] = "✅" if ok else "❌ no se pudo verificar"
  return res


async def totalpass_actualizar(client, clase: dict, cambios: dict, nuevo: dict) -> dict:
  uuid = clase.get("totalpass_occurrence_uuid")
  if not uuid:
    return {"estado": "no publicada"}

  token = await get_booking_token(get_place_api_key(clase["sucursal_id"]))
  H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json", "accept": "application/json"}

  # Horario o duración (solo sin reservas): borrar y volver a publicar
  if "horario" in cambios or "duracion_minutos" in cambios:
    await client.delete(f"{TP_BASE}/partner/event-occurrence/{uuid}", headers=H)
    supabase.table("clases").update({"totalpass_occurrence_uuid": None}).eq("id", clase["id"]).execute()
    r = await publicar_clase_totalpass({
      "clase_id":         clase["id"],
      "sucursal_id":      clase["sucursal_id"],
      "nombre":           nuevo["nombre"],
      "horario":          nuevo["horario"],
      "duracion_minutos": nuevo["duracion_minutos"],
      "capacidad_max":    nuevo["capacidad_max"],
      "coach":            nuevo["coach"] or "Navy Coach",
    })
    return {"recreada": "✅", "nuevo_uuid": r.get("occurrence_uuid")}

  # Nombre / coach: actualizar la occurrence
  body = {}
  if "nombre" in cambios: body["title"]       = nuevo["nombre"]
  if "coach"  in cambios: body["responsible"] = nuevo["coach"] or "Navy Coach"
  if not body:
    return {"estado": "sin cambios de datos"}

  await client.put(f"{TP_BASE}/partner/event-occurrence/{uuid}", headers=H, json=body)
  g = await client.get(f"{TP_BASE}/partner/events/{uuid}", headers=H)
  ok = g.status_code == 200 and all(
    (g.json().get("title") or "").strip() == v.strip() if k == "title" else
    (g.json().get("responsible") or "").strip() == v.strip()
    for k, v in body.items()
  )
  return {"datos": "✅" if ok else "❌ no se pudo verificar"}


# ─── Endpoint ────────────────────────────────────────────────────────────────
@router.post("/actualizar")
async def actualizar_clase(request: Request):
  quien = await autorizar(request)
  req = await request.json()
  clase_id = req.get("clase_id")
  notificar = req.get("notificar", True)
  if not clase_id:
    raise HTTPException(status_code=400, detail="clase_id requerido")

  r = supabase.table("clases").select(
    "id, nombre_clase, horario, duracion_minutos, capacidad_max, coach_id, room_id, sucursal_id, estado, "
    "wellhub_class_id, wellhub_slot_id, totalpass_occurrence_uuid, "
    "staff(nombre, primer_apellido), sucursales(nombre)"
  ).eq("id", clase_id).limit(1).execute()
  if not r.data:
    raise HTTPException(status_code=404, detail="Clase no encontrada")
  clase = r.data[0]
  if clase.get("estado") != "Activa":
    raise HTTPException(status_code=400, detail="Solo se pueden editar clases activas")
  if parse_dt(clase["horario"]) < datetime.now(timezone.utc):
    raise HTTPException(status_code=400, detail="No se pueden editar clases que ya pasaron")

  reservas = supabase.table("reservas").select(
    "id, origen, clientes(nombre_completo, email, push_tokens(token))"
  ).eq("clase_id", clase_id).neq("estatus", "Cancelada").execute().data or []
  n_reservas = len(reservas)

  coach_actual = nombre_coach(clase.get("staff"))
  actual = {
    "nombre":           clase["nombre_clase"],
    "coach_id":         clase.get("coach_id"),
    "coach":            coach_actual,
    "capacidad_max":    clase["capacidad_max"],
    "horario":          clase["horario"],
    "duracion_minutos": clase["duracion_minutos"],
  }
  nuevo = dict(actual)
  cambios: dict = {}
  advertencias: list = []

  # Nombre
  if req.get("nombre") is not None:
    n = " ".join(str(req["nombre"]).split())
    if not n:
      raise HTTPException(status_code=400, detail="El nombre no puede ir vacío")
    if n != actual["nombre"].strip():
      nuevo["nombre"] = n
      cambios["nombre"] = {"antes": actual["nombre"], "despues": n}

  # Coach
  if "coach_id" in req and req["coach_id"] != actual["coach_id"]:
    if req["coach_id"]:
      c = supabase.table("staff").select("id, nombre, primer_apellido, estatus")\
        .eq("id", req["coach_id"]).limit(1).execute()
      if not c.data or c.data[0].get("estatus") != "Activo":
        raise HTTPException(status_code=400, detail="Coach no encontrado o inactivo")
      nuevo["coach"] = nombre_coach(c.data[0])
    else:
      nuevo["coach"] = None
    nuevo["coach_id"] = req["coach_id"]
    cambios["coach"] = {"antes": coach_actual, "despues": nuevo["coach"]}

  # Capacidad
  if req.get("capacidad_max") is not None:
    cap = int(req["capacidad_max"])
    if cap < 1:
      raise HTTPException(status_code=400, detail="La capacidad debe ser al menos 1")
    if cap < n_reservas:
      raise HTTPException(status_code=400,
        detail=f"No puedes bajar la capacidad a {cap}: ya hay {n_reservas} reservas activas")
    if cap != actual["capacidad_max"]:
      if clase.get("room_id"):
        spots = supabase.table("room_spots").select("id", count="exact")\
          .eq("room_id", clase["room_id"]).eq("bloqueado", False).execute().count or 0
        if spots and cap > spots:
          advertencias.append(f"El room tiene {spots} lugares; los clientes de la app no podrán elegir lugar después del {spots}")
      nuevo["capacidad_max"] = cap
      cambios["capacidad_max"] = {"antes": actual["capacidad_max"], "despues": cap}

  # Horario y duración: solo sin reservas
  if req.get("horario") is not None and parse_dt(req["horario"]) != parse_dt(actual["horario"]):
    if n_reservas > 0:
      raise HTTPException(status_code=400,
        detail=f"No se puede cambiar la hora: hay {n_reservas} reservas. Cancela la clase y crea una nueva.")
    if parse_dt(req["horario"]) < datetime.now(timezone.utc):
      raise HTTPException(status_code=400, detail="La nueva hora ya pasó")
    nuevo["horario"] = parse_dt(req["horario"]).astimezone(timezone.utc).isoformat()
    cambios["horario"] = {"antes": actual["horario"], "despues": nuevo["horario"]}

  if req.get("duracion_minutos") is not None and int(req["duracion_minutos"]) != actual["duracion_minutos"]:
    if n_reservas > 0:
      raise HTTPException(status_code=400,
        detail=f"No se puede cambiar la duración: hay {n_reservas} reservas.")
    nuevo["duracion_minutos"] = int(req["duracion_minutos"])
    cambios["duracion_minutos"] = {"antes": actual["duracion_minutos"], "despues": nuevo["duracion_minutos"]}

  if not cambios:
    return {"ok": True, "sin_cambios": True}

  # 1. Supabase
  upd = {}
  if "nombre"           in cambios: upd["nombre_clase"]     = nuevo["nombre"]
  if "coach"            in cambios: upd["coach_id"]         = nuevo["coach_id"]
  if "capacidad_max"    in cambios: upd["capacidad_max"]    = nuevo["capacidad_max"]
  if "horario"          in cambios: upd["horario"]          = nuevo["horario"]
  if "duracion_minutos" in cambios: upd["duracion_minutos"] = nuevo["duracion_minutos"]
  supabase.table("clases").update(upd).eq("id", clase_id).execute()

  plataformas = {}
  async with httpx.AsyncClient(timeout=20.0) as client:
    # 2. Wellhub
    try:
      plataformas["wellhub"] = await wellhub_actualizar(client, clase, cambios, nuevo)
    except Exception as e:
      plataformas["wellhub"] = {"error": str(e)}

    # 3. TotalPass
    try:
      plataformas["totalpass"] = await totalpass_actualizar(client, clase, cambios, nuevo)
    except Exception as e:
      plataformas["totalpass"] = {"error": str(e)}

  # 4. Cupos en todas las plataformas
  try:
    plataformas["cupos"] = await sincronizar_cupos(clase_id)
  except Exception as e:
    plataformas["cupos"] = {"error": str(e)}

  # 5. Avisar a los clientes (solo si cambió algo que ven: nombre o coach)
  notificados = 0
  if notificar and n_reservas > 0 and ("nombre" in cambios or "coach" in cambios):
    sucursal = (clase.get("sucursales") or {}).get("nombre", "Navy Training Center")
    partes = []
    if "nombre" in cambios: partes.append(f"ahora es {nuevo['nombre']}")
    if "coach"  in cambios: partes.append(f"coach {nuevo['coach'] or 'por confirmar'}")
    cuerpo_push = f"Tu clase del {fmt_fecha_hora(nuevo['horario'])}: {', '.join(partes)}."

    async with httpx.AsyncClient(timeout=15.0) as client:
      for rv in reservas:
        cli = rv.get("clientes") or {}
        tokens = [pt["token"] for pt in (cli.get("push_tokens") or []) if pt.get("token")]
        avisado = False
        if tokens:
          try:
            await enviar_push(tokens, titulo="Cambio en tu clase", cuerpo=cuerpo_push,
                              data={"tipo": "clase_modificada", "clase_id": clase_id})
            avisado = True
          except Exception as e:
            print("Error push cambio clase:", e)
        if cli.get("email"):
          try:
            await client.post("https://api.resend.com/emails",
              headers={"Authorization": f"Bearer {os.getenv('RESEND_API_KEY')}", "Content-Type": "application/json"},
              json={
                "from":    "Navy Training Center <noreply@navytrainingcenter.com>",
                "to":      cli["email"],
                "subject": f"Cambio en tu clase - {nuevo['nombre']}",
                "html":    correo_cambio(cli.get("nombre_completo"), actual["nombre"], nuevo["nombre"],
                                         coach_actual, nuevo["coach"], nuevo["horario"], sucursal),
              })
            avisado = True
          except Exception as e:
            print("Error correo cambio clase:", e)
        if avisado:
          notificados += 1

  # 6. Auditoría
  nombre_quien = " ".join(f"{quien.get('nombre') or ''} {quien.get('primer_apellido') or ''}".split())
  etiquetas = {"nombre": "Nombre", "coach": "Coach", "capacidad_max": "Cupos",
               "horario": "Hora", "duracion_minutos": "Duración"}
  try:
    supabase.table("actividad_log").insert({
      "tipo":        "clase_editada",
      "descripcion": f"{nombre_quien} editó \"{nuevo['nombre']}\" ({fmt_fecha_hora(nuevo['horario'])}): "
                     + ", ".join(etiquetas[k] for k in cambios),
      "tabla":       "clases",
      "accion":      "UPDATE",
      "metadata":    {"clase_id": clase_id, "cambios": cambios, "reservas": n_reservas,
                      "notificados": notificados, "plataformas": plataformas, "advertencias": advertencias},
      "sucursal_id": clase["sucursal_id"],
      "staff_id":    quien.get("id"),
    }).execute()
  except Exception as e:
    print("Error log clase_editada:", e)

  print(f"✏️ Clase editada {clase_id}: {cambios} | {plataformas}")
  return {
    "ok":           True,
    "cambios":      cambios,
    "reservas":     n_reservas,
    "notificados":  notificados,
    "plataformas":  plataformas,
    "advertencias": advertencias,
  }