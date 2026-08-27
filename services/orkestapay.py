import os
import httpx
from dotenv import load_dotenv
from services.supabase import supabase

load_dotenv()

BASE_URL =      "https://api.sand.orkestapay.com/v1" # cambiar a prod cuando sea el momento
CLIENT_ID     = os.getenv("ORKESTAPAY_CLIENT_ID")
CLIENT_SECRET = os.getenv("ORKESTAPAY_CLIENT_SECRET")
MERCHANT_ID   = os.getenv("ORKESTAPAY_MERCHANT_ID")
PUBLIC_KEY    = os.getenv("ORKESTAPAY_PUBLIC_KEY")

async def get_access_token() -> str:
  payload = {
    "client_id":     CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "grant_type":    "client_credentials"
  }
  print("Auth payload:", payload)
  async with httpx.AsyncClient() as client:
    res = await client.post(f"{BASE_URL}/oauth/tokens", json=payload)
    print("Auth response:", res.status_code, res.text)
    res.raise_for_status()
    return res.json()["access_token"]

async def crear_orden(token: str, cliente: dict, paquete: dict, monto: float, merchant_order_id: str) -> dict:
  async with httpx.AsyncClient() as client:
    payload = {
      "merchant_order_id": merchant_order_id,
      "currency":          "MXN",
      "subtotal_amount":   monto,
      "total_amount":      monto,
      "country_code":      "MX",
      "products": [{
        "product_id":         paquete["id"],
        "name":       paquete["nombre"],
        "quantity":   1,
        "unit_price": monto,
      }],
      "customer": {
        "first_name": cliente["nombre"].split()[0],
        "last_name":  " ".join(cliente["nombre"].split()[1:]) or "N/A",
        "email":      cliente["email"],
      }
    }
    print("Orden payload:", payload)
    res = await client.post(
      f"{BASE_URL}/orders",
      headers={ "Authorization": f"Bearer {token}", "Accept": "application/json" },
      json=payload
    )
    print("Orden response:", res.status_code, res.text)
    res.raise_for_status()
    return res.json()

async def registrar_pago(token, order_id, payment_method_id, device_session_id, idempotency_key):
  async with httpx.AsyncClient() as client:
    payload = {
      "payment_source": {
        "type":              "CARD",
        "payment_method_id": payment_method_id,
        "settings": { "card": { "capture": True } }
      },
      "device_session_id": device_session_id,
      "order_id":          order_id,
    }
    print("Pago payload:", payload)
    res = await client.post(
      f"{BASE_URL}/payments",
      headers={
        "Authorization":   f"Bearer {token}",
        "Accept":          "application/json",
        "Idempotency-Key": idempotency_key,
      },
      json=payload
    )
    print("Pago response:", res.status_code, res.text)
    res.raise_for_status()
    return res.json()


def get_orkestapay_keys(sucursal_id: str) -> dict:
  res = supabase.table("sucursal_orkestapay")\
    .select("client_id, client_secret, merchant_id, public_key, ambiente")\
    .eq("sucursal_id", sucursal_id)\
    .single().execute()
  
  if not res.data:
    raise Exception(f"No hay keys de OrkestaPay para sucursal {sucursal_id}")
  
  return res.data

async def get_access_token_sucursal(sucursal_id: str) -> tuple:
  keys = get_orkestapay_keys(sucursal_id)
  
  ambiente = keys["ambiente"]
  base_url = "https://api.orkestapay.com/v1" if ambiente == "production" else "https://api.sand.orkestapay.com/v1"
  
  async with httpx.AsyncClient(timeout=30.0) as client:
    res = await client.post(
      f"{base_url}/oauth/tokens",
      json={
        "client_id":     keys["client_id"],
        "client_secret": keys["client_secret"],
        "grant_type":    "client_credentials",
      }
    )
    print("Auth sucursal response:", res.status_code, res.text)
    res.raise_for_status()
    return res.json()["access_token"], keys
  

async def crear_customer(sucursal_id: str, cliente: dict) -> str:
  """Crea un customer en OrkestaPay y regresa el customer_id"""
  token, keys = await get_access_token_sucursal(sucursal_id)
  ambiente = keys["ambiente"]
  base_url = "https://api.orkestapay.com/v1" if ambiente == "production" else "https://api.sand.orkestapay.com/v1"

  nombre_parts = cliente.get("nombre_completo", "").split()
  first_name   = nombre_parts[0] if nombre_parts else "N/A"
  last_name    = " ".join(nombre_parts[1:]) if len(nombre_parts) > 1 else "N/A"

  async with httpx.AsyncClient(timeout=30.0) as client:
    res = await client.post(
      f"{base_url}/customers",
      headers={ "Authorization": f"Bearer {token}", "Content-Type": "application/json" },
      json={
        "first_name": first_name,
        "last_name":  last_name,
        "email":      cliente.get("email"),
      }
    )
    print("Crear customer response:", res.status_code, res.text)
    res.raise_for_status()
    return res.json()["customer_id"]

async def listar_metodos_pago(sucursal_id: str, customer_id: str) -> list:
  token, keys = await get_access_token_sucursal(sucursal_id)
  ambiente = keys["ambiente"]
  base_url = "https://api.orkestapay.com/v1" if ambiente == "production" else "https://api.sand.orkestapay.com/v1"

  async with httpx.AsyncClient(timeout=30.0) as client:
    res = await client.get(
      f"{base_url}/customers/{customer_id}/payment-methods",
      headers={ "Authorization": f"Bearer {token}" }
    )
    if res.status_code == 404:
      return []
    res.raise_for_status()
    return res.json()

async def cobrar_tarjeta_guardada(sucursal_id: str, customer_id: str, payment_method_id: str, monto: float, concepto: str, idempotency_key: str) -> dict:
  """Cobra directamente a una tarjeta guardada sin checkout"""
  token, keys = await get_access_token_sucursal(sucursal_id)
  ambiente = keys["ambiente"]
  base_url = "https://api.orkestapay.com/v1" if ambiente == "production" else "https://api.sand.orkestapay.com/v1"

  import uuid
  merchant_order_id = str(uuid.uuid4()).replace("-", "")[:16]

  async with httpx.AsyncClient(timeout=30.0) as client:
    # 1. Crear orden
    orden_res = await client.post(
      f"{base_url}/orders",
      headers={ "Authorization": f"Bearer {token}", "Content-Type": "application/json" },
      json={
        "merchant_order_id": merchant_order_id,
        "currency":          "MXN",
        "subtotal_amount":   monto,
        "total_amount":      monto,
        "country_code":      "MX",
        "customer_id":       customer_id,
        "products": [{
          "product_id": "degali-001",
          "name":       concepto,
          "quantity":   1,
          "unit_price": monto,
        }],
      }
    )
    orden_res.raise_for_status()
    order_id = orden_res.json()["order_id"]

    # 2. Cobrar
    pago_res = await client.post(
      f"{base_url}/payments",
      headers={
        "Authorization":   f"Bearer {token}",
        "Content-Type":    "application/json",
        "Idempotency-Key": idempotency_key,
      },
      json={
        "order_id": order_id,
        "payment_source": {
          "type":              "CARD",
          "payment_method_id": payment_method_id,
          "customer_id":       customer_id,
          "settings": { "card": { "capture": True } }
        },
      }
    )
    print("Cobrar tarjeta response:", pago_res.status_code, pago_res.text)
    pago_res.raise_for_status()
    return pago_res.json()