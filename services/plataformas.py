# services/plataformas.py — los datos de Wellhub de cada sucursal, desde la base (sucursales.wellhub_gym_id / wellhub_product_id)
import time
from services.supabase import supabase

# Respaldo: lo que funcionaba antes, por si la base no responde (Condesa sigue igual pase lo que pase)
_RESPALDO = {
  "1b2032dc-f5da-40c6-8c4e-e227be14673b": {"gym_id": "848637", "product_id": 953550},   # Condesa Gym
  "f8f798a8-d89b-4874-a53a-cdcb6325ad2a": {"gym_id": "848638", "product_id": 953551},   # Condesa Studio
}
_cache: dict = {}


def wellhub_de(sucursal_id: str | None) -> dict | None:
  """{'gym_id': '522244', 'product_id': 123} de esa sucursal, o None si no está en Wellhub."""
  if not sucursal_id:
    return None
  hit = _cache.get(sucursal_id)
  if hit and time.time() - hit[1] < 300:
    return hit[0]
  cfg = None
  try:
    f = supabase.table("sucursales").select("wellhub_gym_id, wellhub_product_id").eq("id", sucursal_id).limit(1).execute().data
    if f and f[0].get("wellhub_gym_id"):
      prod = f[0].get("wellhub_product_id")
      cfg = {"gym_id": str(f[0]["wellhub_gym_id"]).strip(), "product_id": int(prod) if prod else None}
  except Exception as e:
    print("plataformas wellhub_de:", e)
  if not cfg:
    cfg = _RESPALDO.get(sucursal_id)
  elif not cfg["product_id"] and sucursal_id in _RESPALDO:
    cfg["product_id"] = _RESPALDO[sucursal_id]["product_id"]
  _cache[sucursal_id] = (cfg, time.time())
  return cfg


def olvidar_cache():
  _cache.clear()