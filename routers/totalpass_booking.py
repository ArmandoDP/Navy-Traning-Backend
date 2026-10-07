from fastapi               import APIRouter, Request, HTTPException
from services.supabase     import supabase
from routers.sincronizacion import sincronizar_cupos
import httpx
import os

router = APIRouter()

PARTNER_API_KEY  = os.getenv("TOTALPASS_PARTNER_API_KEY")
BOOKING_BASE_URL = "https://booking-api.totalpass.com"


def get_place_api_key(sucursal_id: str) -> str:
  res = supabase.table("sucursales").select("totalpass_place_api_key").eq("id", sucursal_id).single().execute()
  if not res.data or not res.data.get("totalpass_place_api_key"):
    raise HTTPException(status_code=404, detail=f"No hay TotalPass place_api_key para sucursal {sucursal_id}")
  return res.data["totalpass_place_api_key"]


async def get_booking_token(place_api_key: str) -> str:
  async with httpx.AsyncClient() as client:
    res = await client.post(
      f"{BOOKING_BASE_URL}/partner/auth",
      json={
        "partner_api_key": PARTNER_API_KEY,
        "place_api_key":   place_api_key,
      }
    )
    print("TotalPass auth status:", res.status_code)
    res.raise_for_status()
    return res.json()["token"]


async def confirmar_slot(slot_id: str, token: str, state: str, reason: str = "reason_not_provided"):
  async with httpx.AsyncClient() as client:
    res = await client.put(
      f"{BOOKING_BASE_URL}/partner/slot/confirmSlot/{slot_id}",
      headers={ "Authorization": f"Bearer {token}" },
      json={ "state": state, "reason": reason }
    )
    print(f"confirmar_slot: {res.status_code} {res.text[:100]}")
    try:
      return res.json()
    except Exception:
      return {}


VENTANA_CANCELACION_MIN = int(os.getenv("CANCELACION_MIN", "720"))   # 12 h: cancelar después = cancelación tardía (alerta)


async def _cancelar_booking_totalpass(slot_id: str, body: dict):
  """El usuario canceló en TotalPass: liberar su lugar en Navy."""
  bk = supabase.table("totalpass_bookings").select("id, clase_id, cliente_id, reserva_id, estatus, email")\
    .eq("slot_id", slot_id).limit(1).execute()
  if not bk.data:
    print(f"Cancelación TotalPass de slot desconocido {slot_id}")
    return {"received": True, "cancelado": False}
  b = bk.data[0]
  if b.get("estatus") == "Cancelado":
    return {"received": True, "duplicado": True}

  supabase.table("totalpass_bookings").update({"estatus": "Cancelado"}).eq("id", b["id"]).execute()

  if b.get("reserva_id"):
    supabase.table("reservas").update({"estatus": "Cancelada"}).eq("id", b["reserva_id"]).execute()
  else:
    # Bookings viejos sin reserva_id: la reserva TotalPass activa de ese cliente en esa clase
    q = supabase.table("reservas").select("id").eq("clase_id", b["clase_id"])\
      .eq("origen", "TotalPass").neq("estatus", "Cancelada")
    q = q.eq("cliente_id", b["cliente_id"]) if b.get("cliente_id") else q.is_("cliente_id", "null")
    r = q.limit(1).execute()
    if r.data:
      supabase.table("reservas").update({"estatus": "Cancelada"}).eq("id", r.data[0]["id"]).execute()

  await sincronizar_cupos(b["clase_id"])

  # Alerta si canceló muy cerca de la clase
  try:
    from datetime import datetime, timezone
    cl = supabase.table("clases").select("nombre_clase, horario").eq("id", b["clase_id"]).limit(1).execute()
    if cl.data:
      inicio = datetime.fromisoformat(cl.data[0]["horario"].replace("Z", "+00:00"))
      minutos = (inicio - datetime.now(timezone.utc)).total_seconds() / 60
      if minutos < VENTANA_CANCELACION_MIN:
        supabase.table("alertas").insert({
          "tipo":        "no_show",
          "categoria":   "asistencia",
          "titulo":      "Cancelación tardía — TotalPass",
          "descripcion": f"{b.get('email') or 'Usuario'} canceló {cl.data[0]['nombre_clase']} {int(max(minutos, 0))} min antes",
          "cliente_id":  b.get("cliente_id"),
          "metadata":    {"slot_id": slot_id},
        }).execute()
  except Exception as e:
    print("Error alerta cancelación tardía:", e)

  print(f"🔓 TotalPass cancelado: slot {slot_id} → lugar liberado")
  return {"received": True, "cancelado": True}


@router.post("/booking/webhook")
async def totalpass_booking_webhook(request: Request):
  body = await request.json()
  print("TotalPass Booking webhook:", body)

  try:
    user  = body.get("user", {}) or {}
    event = body.get("event", {}) or {}
    slot  = body.get("slot", {}) or {}

    slot_id         = slot.get("id")
    email           = (user.get("email") or "").strip().lower() or None
    nombre          = user.get("name") or ""
    occurrence_uuid = event.get("id")
    estado          = str(slot.get("status") or "").lower()

    if not slot_id:
      return { "received": True, "error": "slot_id faltante" }

    # ── Cancelación ──
    if "cancel" in estado:
      return await _cancelar_booking_totalpass(slot_id, body)

    # Anti-duplicado: el mismo aviso de reserva llegando dos veces
    existente_slot = supabase.table("totalpass_bookings").select("id")\
      .eq("slot_id", slot_id).limit(1).execute()
    if existente_slot.data:
      print(f"Slot {slot_id} ya procesado — ignorando webhook duplicado")
      return { "received": True, "duplicado": True }

    clase_res = supabase.table("clases").select("id, capacidad_max, sucursal_id")\
      .eq("totalpass_occurrence_uuid", str(occurrence_uuid)).limit(1).execute()
    clase = clase_res.data[0] if clase_res.data else None

    if not clase:
      print(f"Clase no encontrada para occurrence_uuid: {occurrence_uuid}")
      return { "received": True, "error": "Clase no encontrada" }

    place_api_key = get_place_api_key(clase["sucursal_id"]) if clase.get("sucursal_id") \
      else os.getenv("TOTALPASS_PLACE_API_KEY")

    # Buscar / crear cliente (sin importar mayúsculas)
    cliente_id = None
    if email:
      cliente_res = supabase.table("clientes").select("id").ilike("email", email).limit(1).execute()
      cliente_id  = cliente_res.data[0]["id"] if cliente_res.data else None

    if not cliente_id and email:
      try:
        nombre_completo = nombre.strip() if nombre.strip() else email.split("@")[0]
        nuevo = supabase.table("clientes").insert({
          "nombre_completo": nombre_completo,
          "email":           email,
          "estatus":         "Activo",
          "plan":            "TotalPass",
          "origen":          "TotalPass",
          "sucursal_id":     clase.get("sucursal_id"),
        }).execute()
        cliente_id = nuevo.data[0]["id"] if nuevo.data else None
        print(f"Cliente TotalPass creado: {email}")
      except Exception as e:
        print(f"Error creando cliente TotalPass: {e}")

    # Si ya tiene una reserva activa en esta clase, se reutiliza y se CONFIRMA la nueva solicitud
    # (antes se ignoraba y TotalPass la rechazaba aunque hubiera lugar)
    reserva_existente = None
    if cliente_id:
      ex = supabase.table("reservas").select("id")\
        .eq("cliente_id", cliente_id).eq("clase_id", clase["id"])\
        .neq("estatus", "Cancelada").limit(1).execute()
      reserva_existente = ex.data[0]["id"] if ex.data else None

    supabase.table("totalpass_bookings").insert({
      "slot_id":         slot_id,
      "email":           email,
      "nombre":          nombre,
      "cliente_id":      cliente_id,
      "occurrence_uuid": str(occurrence_uuid),
      "clase_id":        clase["id"],
      "sucursal_id":     clase.get("sucursal_id"),
      "estatus":         "Pendiente",
      "reserva_id":      reserva_existente,
      "metadata":        body,
    }).execute()

    token = await get_booking_token(place_api_key)

    activas_res = supabase.table("reservas").select("id", count="exact")\
      .eq("clase_id", clase["id"]).neq("estatus", "Cancelada").execute()
    activas  = activas_res.count or 0
    hay_cupo = bool(reserva_existente) or activas < (clase.get("capacidad_max") or 999)

    if hay_cupo:
      reserva_id = reserva_existente
      if not reserva_id:
        try:
          ins = supabase.table("reservas").insert({
            "clase_id":       clase["id"],
            "cliente_id":     cliente_id,
            "estatus":        "Confirmada",
            "origen":         "TotalPass",
            "nombre_externo": None if cliente_id else nombre,
            "email_externo":  None if cliente_id else email,
          }).execute()
          reserva_id = ins.data[0]["id"] if ins.data else None
        except Exception as e:
          print(f"Error insertando reserva TotalPass: {e}")

      await sincronizar_cupos(clase["id"])

      try:
        await confirmar_slot(slot_id, token, "confirmed")
        supabase.table("totalpass_bookings").update({"estatus": "Confirmado", "reserva_id": reserva_id})\
          .eq("slot_id", slot_id).execute()
      except Exception as errConfirm:
        print("Error confirmando booking:", str(errConfirm))

    else:
      try:
        await confirmar_slot(slot_id, token, "denied", "class_overbooked")
        supabase.table("totalpass_bookings").update({ "estatus": "Rechazado" })\
          .eq("slot_id", slot_id).execute()
      except Exception as errReject:
        print("Error rechazando booking:", str(errReject))

    return { "received": True, "confirmado": hay_cupo }

  except Exception as e:
    print("Error TotalPass Booking webhook:", str(e))
    return { "received": True, "error": str(e) }


@router.post("/booking/registrar-webhook")
async def registrar_booking_webhook(sucursal_id: str = None):
  try:
    place_api_key = get_place_api_key(sucursal_id) if sucursal_id else os.getenv("TOTALPASS_PLACE_API_KEY")
    token = await get_booking_token(place_api_key)
    async with httpx.AsyncClient() as client:
      res = await client.post(
        f"{BOOKING_BASE_URL}/partner/webhook/subscribe",
        headers={ "Authorization": f"Bearer {token}" },
        json={ "webhook_url": "https://navy-traning-backend-production.up.railway.app/totalpass-booking/booking/webhook" }
      )
      print("Registro booking webhook:", res.status_code, res.text)
      res.raise_for_status()
      return res.json()
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))


@router.get("/planes")
async def obtener_planes(sucursal_id: str):
  try:
    place_api_key = get_place_api_key(sucursal_id)
    token = await get_booking_token(place_api_key)
    async with httpx.AsyncClient(timeout=30.0) as client:
      res = await client.get(
        f"{BOOKING_BASE_URL}/partner/plans",
        headers={ "Authorization": f"Bearer {token}" }
      )
      res.raise_for_status()
      return res.json()
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))


@router.post("/publicar-clase")
async def publicar_clase_totalpass(req: dict):
  try:
    clase_id    = req.get("clase_id")
    sucursal_id = req.get("sucursal_id")
    nombre      = req.get("nombre")
    descripcion = req.get("descripcion", "")
    horario     = req.get("horario")  # ISO string UTC
    duracion    = req.get("duracion_minutos", 60)
    capacidad   = req.get("capacidad_max", 10)
    coach       = req.get("coach", "Navy Coach")

    sucursal_res = supabase.table("sucursales")\
      .select("totalpass_place_api_key, totalpass_plan_id")\
      .eq("id", sucursal_id).single().execute()

    sucursal = sucursal_res.data
    if not sucursal or not sucursal.get("totalpass_place_api_key"):
      raise HTTPException(status_code=404, detail="No hay TotalPass key para esta sucursal")

    plan_id = sucursal.get("totalpass_plan_id")
    if not plan_id:
      raise HTTPException(status_code=400, detail="No hay planId de TotalPass para esta sucursal")

    token = await get_booking_token(sucursal["totalpass_place_api_key"])

    from datetime import datetime, timedelta
    dt_utc  = datetime.fromisoformat(horario.replace("Z", "+00:00"))
    dt_cdmx = dt_utc - timedelta(hours=6)
    event_date = dt_cdmx.strftime("%Y-%m-%d")
    start_time = dt_cdmx.strftime("%I:%M %p")
    # Después de esta hora, TotalPass cuenta la cancelación como tardía
    max_cancel = (dt_cdmx - timedelta(minutes=VENTANA_CANCELACION_MIN)).strftime("%Y-%m-%d %I:%M %p")

    # Slots para TotalPass = capacidad - reservas que ya existan de otros canales
    reservas_res = supabase.table("reservas").select("origen")\
      .eq("clase_id", clase_id).neq("estatus", "Cancelada").execute()
    otros = sum(1 for r in (reservas_res.data or []) if (r.get("origen") or "") != "TotalPass")
    slots_iniciales = max(capacidad - otros, 1)

    print(f"Publicando en TotalPass: {nombre} | {event_date} {start_time} | slots {slots_iniciales}")

    async with httpx.AsyncClient(timeout=30.0) as client:
      res = await client.post(
        f"{BOOKING_BASE_URL}/partner/event-occurrence",
        headers={
          "Authorization": f"Bearer {token}",
          "Content-Type":  "application/json",
          "accept":        "application/json",
        },
        json={
          "title":       nombre,
          "responsible": coach,
          "duration":    duracion,
          "slots":       slots_iniciales,
          "planId":      plan_id,
          "eventDate":   event_date,
          "startTime":   start_time,
          "timezone":    "es-MX",
          "status":      "ACTIVE",
          "description": descripcion or nombre,
          **({"maxTimeToCancel": max_cancel} if dt_utc - timedelta(minutes=VENTANA_CANCELACION_MIN) > datetime.now(dt_utc.tzinfo) else {}),
        }
      )
      print("TotalPass publicar clase:", res.status_code, res.text[:300])
      res.raise_for_status()
      data = res.json()

    occurrence_uuid = data.get("eventOccurrenceUuid")
    print(f"UUID guardado: {occurrence_uuid}")

    if clase_id and occurrence_uuid:
      supabase.table("clases").update({
        "totalpass_occurrence_uuid": occurrence_uuid,
      }).eq("id", clase_id).execute()

    return {
      "ok":              True,
      "event_id":        data.get("eventId"),
      "occurrence_uuid": occurrence_uuid,
    }

  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))


# Se mantiene por compatibilidad con código viejo; lo nuevo debe usar /sync/cupos
@router.post("/actualizar-cupos")
async def actualizar_cupos_totalpass(req: dict):
  occurrence_uuid = req.get("occurrence_uuid")
  sucursal_id     = req.get("sucursal_id")
  slots           = max(int(req.get("slots") or 1), 1)

  if not occurrence_uuid or not sucursal_id:
    raise HTTPException(status_code=400, detail="Faltan parámetros")

  token = await get_booking_token(get_place_api_key(sucursal_id))

  async with httpx.AsyncClient(timeout=15.0) as client:
    res = await client.put(
      f"{BOOKING_BASE_URL}/partner/event-occurrence/{occurrence_uuid}/slot",
      headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "accept": "application/json"},
      json={"slots": slots},
    )
    print(f"TotalPass actualizar cupos: {res.status_code} {res.text[:200]}")

  return {"ok": True, "slots": slots}


@router.post("/actualizar-clase")
async def actualizar_clase_totalpass(req: dict):
  print("actualizar-clase payload:", req)
  occurrence_uuid  = req.get("occurrence_uuid")
  sucursal_id      = req.get("sucursal_id")
  horario          = req.get("horario")
  duracion_minutos = req.get("duracion_minutos")
  capacidad_max    = req.get("capacidad_max")
  nombre           = req.get("nombre")
  coach            = req.get("coach", "Navy Coach")

  if not occurrence_uuid or not sucursal_id:
    raise HTTPException(status_code=400, detail="Faltan parámetros")

  token = await get_booking_token(get_place_api_key(sucursal_id))

  payload = {}
  if nombre:           payload["title"]       = nombre
  if coach:            payload["responsible"] = coach
  if duracion_minutos: payload["duration"]    = duracion_minutos
  if capacidad_max:    payload["slots"]       = capacidad_max
  if horario:
    from datetime import datetime, timedelta
    dt_utc  = datetime.fromisoformat(horario.replace("Z", "+00:00"))
    dt_cdmx = dt_utc - timedelta(hours=6)
    payload["eventDate"] = dt_cdmx.strftime("%Y-%m-%d")
    payload["startTime"] = dt_cdmx.strftime("%I:%M %p").lstrip("0")

  async with httpx.AsyncClient(timeout=15.0) as client:
    res = await client.put(
      f"{BOOKING_BASE_URL}/partner/event-occurrence/{occurrence_uuid}",
      headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "accept": "application/json"},
      json=payload,
    )
    print(f"TotalPass actualizar clase: {res.status_code} {res.text[:200]}")

  return {"ok": True}