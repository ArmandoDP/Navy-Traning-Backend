from fastapi        import APIRouter, Request, HTTPException
from services.supabase import supabase
import httpx
import os

router = APIRouter()

PARTNER_API_KEY = os.getenv("TOTALPASS_PARTNER_API_KEY")
PLACE_API_KEY   = os.getenv("TOTALPASS_PLACE_API_KEY")
BASE_URL        = "https://gym-service-api.totalpass.com"

async def get_totalpass_token() -> str:
  async with httpx.AsyncClient() as client:
    res = await client.post(
      f"{BASE_URL}/partner/auth",
      json={
        "partner_api_key": PARTNER_API_KEY,
        "place_api_key":   PLACE_API_KEY,
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
    endpoint = body.get("endpoint")  # URL para validar el check-in

    if not endpoint:
      raise HTTPException(status_code=400, detail="endpoint faltante")

    # 1. Buscar cliente por email
    email = user.get("email")
    cliente_res = supabase.table("clientes").select("id").eq("email", email).maybe_single().execute()
    cliente_id  = cliente_res.data["id"] if cliente_res.data else None

    # 2. Guardar el check-in
    supabase.table("totalpass_checkins").insert({
      "email":      email,
      "nombre":     f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
      "cliente_id": cliente_id,
      "endpoint":   endpoint,
      "metadata":   body,
      "validado":   False,
    }).execute()

    # 3. Obtener token y validar check-in
    token = await get_totalpass_token()
    await validar_checkin(endpoint, token)

    # 4. Marcar como validado
    supabase.table("totalpass_checkins").update({ "validado": True })\
      .eq("email", email).eq("validado", False).execute()

    # 5. Si no existe el cliente, crearlo
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
    # Aun si falla la validación, respondemos 200 para que TotalPass no reintente
    return { "received": True, "validado": False, "error": str(e) }

@router.post("/registrar-webhook")
async def registrar_webhook():
  """Llama este endpoint una vez para registrar el webhook en TotalPass"""
  try:
    token = await get_totalpass_token()
    async with httpx.AsyncClient() as client:
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