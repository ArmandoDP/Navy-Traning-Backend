from fastapi        import APIRouter, Request, HTTPException
from services.supabase import supabase
import httpx
import os

router = APIRouter()

PARTNER_API_KEY = os.getenv("TOTALPASS_PARTNER_API_KEY")
BASE_URL        = "https://gym-service-api.totalpass.com"

def get_place_api_key(sucursal_id: str) -> str:
  res = supabase.table("sucursales").select("totalpass_place_api_key").eq("id", sucursal_id).single().execute()
  if not res.data or not res.data.get("totalpass_place_api_key"):
    raise HTTPException(status_code=404, detail=f"No hay TotalPass place_api_key para sucursal {sucursal_id}")
  return res.data["totalpass_place_api_key"]

async def get_totalpass_token(place_api_key: str) -> str:
  async with httpx.AsyncClient() as client:
    res = await client.post(
      f"{BASE_URL}/partner/auth",
      json={
        "partner_api_key": PARTNER_API_KEY,
        "place_api_key":   place_api_key,
      }
    )
    res.raise_for_status()
    return res.json()["token"]

async def validar_checkin(endpoint: str, token: str):
  async with httpx.AsyncClient() as client:
    res = await client.post(endpoint, headers={ "Authorization": f"Bearer {token}" })
    res.raise_for_status()
    return res.json()

@router.post("/webhook")
async def totalpass_webhook(request: Request):
  body = await request.json()
  print("TotalPass webhook recibido:", body)

  try:
    user     = body.get("user", {})
    checkin  = body.get("checkin", {})
    endpoint = body.get("endpoint")

    if not endpoint:
      raise HTTPException(status_code=400, detail="endpoint faltante")

    email = user.get("email")
    cliente_res = supabase.table("clientes").select("id").eq("email", email).maybe_single().execute()
    cliente_id  = cliente_res.data["id"] if cliente_res.data else None

    # Detectar sucursal por gym_id
    gym_id = body.get("checkin", {}).get("gym_id") or body.get("gym", {}).get("id")
    sucursal_res = supabase.table("sucursales")\
      .select("id, totalpass_place_api_key")\
      .eq("totalpass_place_api_key", str(gym_id) if gym_id else "")\
      .maybe_single().execute()
    
    # Si no encontramos por gym_id, usar Condesa como default para pruebas
    place_api_key = sucursal_res.data["totalpass_place_api_key"] if sucursal_res.data else os.getenv("TOTALPASS_PLACE_API_KEY")

    supabase.table("totalpass_checkins").insert({
      "email":      email,
      "nombre":     f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
      "cliente_id": cliente_id,
      "endpoint":   endpoint,
      "metadata":   body,
      "validado":   False,
    }).execute()

    token = await get_totalpass_token(place_api_key)
    await validar_checkin(endpoint, token)

    supabase.table("totalpass_checkins").update({ "validado": True })\
      .eq("email", email).eq("validado", False).execute()

    if not cliente_id:
      supabase.table("clientes").insert({
        "nombre_completo": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
        "email":           email,
        "estatus":         "Activo",
        "plan":            "TotalPass",
      }).execute()

    return { "received": True, "validado": True }

  except Exception as e:
    print("Error procesando webhook TotalPass:", str(e))
    return { "received": True, "validado": False, "error": str(e) }

@router.post("/registrar-webhook")
async def registrar_webhook(sucursal_id: str = None):
  try:
    place_api_key = get_place_api_key(sucursal_id) if sucursal_id else os.getenv("TOTALPASS_PLACE_API_KEY")
    token = await get_totalpass_token(place_api_key)
    async with httpx.AsyncClient() as client:
      res = await client.put(
        f"{BASE_URL}/partner/webhook/update",
        headers={ "Authorization": f"Bearer {token}" },
        json={ 
          "webhook_url":  "https://navy-traning-backend-production.up.railway.app/totalpass/webhook",
          "webhook_type": "CHECKIN"
        }
      )
      if res.status_code == 400:
        res = await client.post(
          f"{BASE_URL}/partner/webhook/create",
          headers={ "Authorization": f"Bearer {token}" },
          json={ 
            "webhook_url":  "https://navy-traning-backend-production.up.railway.app/totalpass/webhook",
            "webhook_type": "CHECKIN"
          }
        )
      print("Registro webhook TotalPass:", res.status_code, res.text)
      res.raise_for_status()
      return res.json()
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))