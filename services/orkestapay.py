import os
import httpx
from dotenv import load_dotenv

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