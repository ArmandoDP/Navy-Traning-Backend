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

    # Buscar clase para obtener sucursal
    clase_res = supabase.table("clases").select("id, capacidad_max, espacios_ocupados, sucursal_id")\
      .eq("totalpass_occurrence_uuid", str(occurrence_uuid)).maybe_single().execute()
    clase = clase_res.data

    # Obtener place_api_key de la sucursal de la clase
    if clase and clase.get("sucursal_id"):
      place_api_key = get_place_api_key(clase["sucursal_id"])
    else:
      place_api_key = os.getenv("TOTALPASS_PLACE_API_KEY")

    cliente_res = supabase.table("clientes").select("id").eq("email", email).maybe_single().execute()
    cliente_id  = cliente_res.data["id"] if cliente_res.data else None

    if not cliente_id:
      new_cli = supabase.table("clientes").insert({
        "nombre_completo": nombre,
        "email":           email,
        "estatus":         "Activo",
        "plan":            "TotalPass",
      }).select().single().execute()
      cliente_id = new_cli.data["id"] if new_cli.data else None

    supabase.table("totalpass_bookings").insert({
      "slot_id":         slot_id,
      "email":           email,
      "nombre":          nombre,
      "cliente_id":      cliente_id,
      "occurrence_uuid": str(occurrence_uuid),
      "clase_id":        clase["id"] if clase else None,
      "estatus":         "Pendiente",
      "metadata":        body,
    }).execute()

    token    = await get_booking_token(place_api_key)
    hay_cupo = True

    if clase:
      ocupados = clase.get("espacios_ocupados") or 0
      hay_cupo = ocupados < clase.get("capacidad_max", 999)

    if hay_cupo:
      try:
        await confirmar_slot(slot_id, token, "confirmed")
        supabase.table("totalpass_bookings").update({ "estatus": "Confirmado" })\
          .eq("slot_id", slot_id).execute()

        if clase and cliente_id:
          supabase.table("reservas").insert({
            "clase_id":   clase["id"],
            "cliente_id": cliente_id,
            "estatus":    "Confirmada",
            "origen":     "TotalPass",
          }).execute()
          supabase.table("clases").update({
            "espacios_ocupados": (clase.get("espacios_ocupados") or 0) + 1
          }).eq("id", clase["id"]).execute()
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