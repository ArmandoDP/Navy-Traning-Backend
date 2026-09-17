from fastapi        import APIRouter, Request, HTTPException
from services.supabase import supabase
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
    print("TotalPass auth body:", res.text)
    res.raise_for_status()
    return res.json()["token"]

async def confirmar_slot(slot_id: str, token: str, state: str, reason: str = "reason_not_provided"):
  async with httpx.AsyncClient() as client:
    res = await client.put(
      f"{BOOKING_BASE_URL}/partner/slot/confirmSlot/{slot_id}",
      headers={ "Authorization": f"Bearer {token}" },
      json={ "state": state, "reason": reason }
    )
    res.raise_for_status()
    return res.json()

@router.post("/booking/webhook")
async def totalpass_booking_webhook(request: Request):
  body = await request.json()
  print("TotalPass Booking webhook:", body)

  try:
    user  = body.get("user", {})
    event = body.get("event", {})
    slot  = body.get("slot", {})

    slot_id         = slot.get("id")
    email           = user.get("email")
    nombre          = user.get("name")
    occurrence_uuid = event.get("id")

    if not slot_id:
      return { "received": True, "error": "slot_id faltante" }

    clase_res = supabase.table("clases").select("id, capacidad_max, espacios_ocupados, sucursal_id")\
      .eq("totalpass_occurrence_uuid", str(occurrence_uuid)).maybe_single().execute()
    clase = clase_res.data

    if not clase:
      print(f"Clase no encontrada para occurrence_uuid: {occurrence_uuid}")
      return { "received": True, "error": "Clase no encontrada" }

    if clase.get("sucursal_id"):
      place_api_key = get_place_api_key(clase["sucursal_id"])
    else:
      place_api_key = os.getenv("TOTALPASS_PLACE_API_KEY")

    cliente_res = supabase.table("clientes").select("id").eq("email", email).maybe_single().execute()
    cliente_id  = cliente_res.data["id"] if cliente_res.data else None

    # Anti-duplicado
    if cliente_id:
      try:
        existente = supabase.table("reservas").select("id")\
          .eq("cliente_id", cliente_id)\
          .eq("clase_id", clase["id"])\
          .neq("estatus", "Cancelada")\
          .maybe_single().execute()
        if existente and existente.data:
          print("Reserva duplicada ignorada:", cliente_id, clase["id"])
          return { "received": True, "duplicado": True }
      except Exception as e:
        print("Error verificando duplicado:", e)

    supabase.table("totalpass_bookings").insert({
      "slot_id":         slot_id,
      "email":           email,
      "nombre":          nombre,
      "cliente_id":      cliente_id,
      "occurrence_uuid": str(occurrence_uuid),
      "clase_id":        clase["id"],
      "estatus":         "Pendiente",
      "metadata":        body,
    }).execute()

    token    = await get_booking_token(place_api_key)
    ocupados = clase.get("espacios_ocupados") or 0
    hay_cupo = ocupados < clase.get("capacidad_max", 999)

    if hay_cupo:
      # Crear reserva primero
      if cliente_id:
        supabase.table("reservas").insert({
            "clase_id":       clase["id"],
            "cliente_id":     cliente_id,
            "estatus":        "Confirmada",
            "origen":         "TotalPass",
            "nombre_externo": nombre if not cliente_id else None,
            "email_externo":  email  if not cliente_id else None,
        }).execute()

      supabase.table("clases").update({
        "espacios_ocupados": ocupados + 1
      }).eq("id", clase["id"]).execute()

      # Luego confirmar en TotalPass
      try:
        await confirmar_slot(slot_id, token, "confirmed")
        supabase.table("totalpass_bookings").update({ "estatus": "Confirmado" })\
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

    # Obtener keys y plan_id de la sucursal
    sucursal_res = supabase.table("sucursales")\
      .select("totalpass_place_api_key, totalpass_plan_id")\
      .eq("id", sucursal_id).single().execute()

    sucursal = sucursal_res.data
    if not sucursal or not sucursal.get("totalpass_place_api_key"):
      raise HTTPException(status_code=404, detail="No hay TotalPass key para esta sucursal")

    plan_id = sucursal.get("totalpass_plan_id")
    if not plan_id:
      raise HTTPException(status_code=400, detail="No hay planId de TotalPass para esta sucursal")

    place_api_key = sucursal["totalpass_place_api_key"]
    token = await get_booking_token(place_api_key)

    # Convertir horario UTC → CDMX (UTC-6)
    from datetime import datetime, timedelta
    dt_utc  = datetime.fromisoformat(horario.replace("Z", "+00:00"))
    dt_cdmx = dt_utc - timedelta(hours=6)

    event_date = dt_cdmx.strftime("%Y-%m-%d")   # "2026-09-10"
    start_time = dt_cdmx.strftime("%I:%M %p")   # "07:55 AM"

    print(f"Publicando en TotalPass: {nombre} | {event_date} {start_time}")

    async with httpx.AsyncClient(timeout=30.0) as client:
      res = await client.post(
        f"{BOOKING_BASE_URL}/partner/event-occurrence",  # ← endpoint correcto
        headers={
          "Authorization": f"Bearer {token}",
          "Content-Type":  "application/json",
          "accept":        "application/json",
        },
        json={
          "title":       nombre,
          "responsible": coach,
          "duration":    duracion,
          "slots":       capacidad,
          "planId":      plan_id,
          "eventDate":   event_date,
          "startTime":   start_time,
          "timezone":    "es-MX",
          "status":      "ACTIVE",
          "description": descripcion or nombre,
        }
      )
      print("TotalPass publicar clase:", res.status_code, res.text)
      res.raise_for_status()
      data = res.json()

    # Leer occurrenceUuid del response
    occurrence_uuid = data.get("eventOccurrenceUuid")

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

@router.post("/actualizar-cupos")
async def actualizar_cupos_totalpass(req: dict):
    occurrence_uuid = req.get("occurrence_uuid")
    sucursal_id     = req.get("sucursal_id")
    slots           = req.get("slots")  # cupos totales disponibles para TotalPass

    if not occurrence_uuid or not sucursal_id:
        raise HTTPException(status_code=400, detail="Faltan parámetros")

    place_api_key = get_place_api_key(sucursal_id)
    token         = await get_booking_token(place_api_key)

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.put(
            f"{BOOKING_BASE_URL}/partner/event-occurrence/{occurrence_uuid}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "accept": "application/json"},
            json={"slots": slots},
        )
        print(f"TotalPass actualizar cupos: {res.status_code} {res.text}")

    return {"ok": True, "slots": slots}


@router.post("/actualizar-clase")
async def actualizar_clase_totalpass(req: dict):
    occurrence_uuid  = req.get("occurrence_uuid")
    sucursal_id      = req.get("sucursal_id")
    horario          = req.get("horario")
    duracion_minutos = req.get("duracion_minutos")
    capacidad_max    = req.get("capacidad_max")
    nombre           = req.get("nombre")
    coach            = req.get("coach", "Navy Coach")

    if not occurrence_uuid or not sucursal_id:
        raise HTTPException(status_code=400, detail="Faltan parámetros")

    place_api_key = get_place_api_key(sucursal_id)
    token         = await get_booking_token(place_api_key)

    payload = {}
    if nombre:           payload["title"]     = nombre
    if coach:            payload["responsible"] = coach
    if duracion_minutos: payload["duration"]  = duracion_minutos
    if capacidad_max:    payload["slots"]     = capacidad_max
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
        print(f"TotalPass actualizar clase: {res.status_code} {res.text}")

    return {"ok": True}