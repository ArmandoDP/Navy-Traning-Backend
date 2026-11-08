# routers/plataformas.py  →  prefijo /plataformas   (solo dirección)
# Dar de alta una sucursal en Wellhub y TotalPass con UN botón:
#   · Wellhub: busca el producto de su gym y lo guarda
#   · TotalPass: busca su plan y lo guarda, y registra los avisos de reservas y check-ins
import os
import httpx
from fastapi import APIRouter, HTTPException, Request
from services.supabase import supabase
from services.auth_app import staff_de_sesion
from services.plataformas import wellhub_de, olvidar_cache

router = APIRouter()
BACKEND = os.getenv("BACKEND_PUBLIC_URL", "https://navy-traning-backend-production.up.railway.app")
WELLHUB = "https://api.partners.gympass.com"
TP_BOOKING = "https://booking-api.totalpass.com"
TP_GYM = "https://gym-service-api.totalpass.com"


def _wh_headers():
  return {"Authorization": f"Bearer {os.getenv('WELLHUB_API_KEY')}", "Content-Type": "application/json"}


async def _wellhub(client: httpx.AsyncClient, suc: dict) -> dict:
  gym = suc.get("wellhub_gym_id")
  if not gym:
    return {"estado": "sin Gym ID de Wellhub (todavía no está en Wellhub)"}
  if suc.get("wellhub_product_id"):
    return {"estado": "listo", "gym_id": gym, "product_id": suc["wellhub_product_id"]}
  # El producto (la "actividad" que vende Wellhub en ese gym) se necesita para publicar clases
  for ruta in (f"/booking/v1/gyms/{gym}/products", f"/setup/v1/gyms/{gym}/products"):
    try:
      r = await client.get(f"{WELLHUB}{ruta}", headers=_wh_headers())
    except Exception as e:
      return {"estado": f"no se pudo consultar Wellhub: {e}"}
    if r.status_code == 404:
      continue
    if r.status_code >= 400:
      return {"estado": f"Wellhub respondió {r.status_code}", "detalle": r.text[:300]}
    datos = r.json()
    lista = datos.get("products") or datos.get("results") or datos.get("data") or (datos if isinstance(datos, list) else [])
    productos = [{"id": p.get("product_id") or p.get("id"), "nombre": p.get("name")} for p in lista if isinstance(p, dict)]
    if len(productos) == 1 and productos[0]["id"]:
      supabase.table("sucursales").update({"wellhub_product_id": int(productos[0]["id"])}).eq("id", suc["id"]).execute()
      return {"estado": "listo (producto guardado)", "gym_id": gym, "product_id": productos[0]["id"]}
    return {"estado": "elige el producto" if productos else "Wellhub no regresó productos", "gym_id": gym,
            "productos": productos, "ayuda": "guárdalo con: UPDATE sucursales SET wellhub_product_id = <id> WHERE id = '<sucursal>'"}
  return {"estado": "no encontré la lista de productos en Wellhub; pídele el product_id a Wellhub", "gym_id": gym}


async def _totalpass(client: httpx.AsyncClient, suc: dict) -> dict:
  key = suc.get("totalpass_place_api_key")
  if not key:
    return {"estado": "sin llave de TotalPass (todavía no está en TotalPass)"}
  out = {}
  try:
    auth = await client.post(f"{TP_BOOKING}/partner/auth", json={"partner_api_key": os.getenv("TOTALPASS_PARTNER_API_KEY"), "place_api_key": key})
    token = auth.json().get("token")
  except Exception as e:
    return {"estado": f"no se pudo entrar a TotalPass: {e}"}
  if not token:
    return {"estado": "TotalPass rechazó la llave (¿ya la activaron de su lado?)", "detalle": auth.text[:200]}
  h = {"Authorization": f"Bearer {token}"}

  # Plan
  if suc.get("totalpass_plan_id"):
    out["plan"] = f"listo ({suc['totalpass_plan_id']})"
  else:
    r = await client.get(f"{TP_BOOKING}/partner/plans", headers=h)
    datos = r.json() if r.status_code < 400 else {}
    lista = datos if isinstance(datos, list) else (datos.get("data") or datos.get("plans") or [])
    planes = [{"id": p.get("id") or p.get("uuid"), "nombre": p.get("name") or p.get("title")} for p in lista if isinstance(p, dict)]
    if len(planes) == 1 and planes[0]["id"]:
      supabase.table("sucursales").update({"totalpass_plan_id": str(planes[0]["id"])}).eq("id", suc["id"]).execute()
      out["plan"] = f"listo (plan guardado: {planes[0]['nombre']})"
    else:
      out["plan"] = {"estado": "elige el plan" if planes else f"TotalPass no regresó planes ({r.status_code})", "planes": planes,
                     "ayuda": "guárdalo con: UPDATE sucursales SET totalpass_plan_id = '<id>' WHERE id = '<sucursal>'"}

  # Avisos de reservas
  r = await client.post(f"{TP_BOOKING}/partner/webhook/subscribe", headers=h,
                        json={"webhook_url": f"{BACKEND}/totalpass-booking/booking/webhook"})
  out["avisos_reservas"] = "registrados" if r.status_code < 400 else f"{r.status_code}: {r.text[:150]}"

  # Avisos de check-in
  try:
    auth2 = await client.post(f"{TP_GYM}/partner/auth", json={"partner_api_key": os.getenv("TOTALPASS_PARTNER_API_KEY"), "place_api_key": key})
    h2 = {"Authorization": f"Bearer {auth2.json().get('token')}"}
    cuerpo = {"webhook_url": f"{BACKEND}/totalpass-checkin/webhook", "webhook_type": "CHECKIN"}
    r = await client.put(f"{TP_GYM}/partner/webhook/update", headers=h2, json=cuerpo)
    if r.status_code == 400:
      r = await client.post(f"{TP_GYM}/partner/webhook/create", headers=h2, json=cuerpo)
    out["avisos_checkin"] = "registrados" if r.status_code < 400 else f"{r.status_code}: {r.text[:150]}"
  except Exception as e:
    out["avisos_checkin"] = f"no se pudo: {e}"
  return out


@router.get("/estado")
async def estado(request: Request):
  """Cómo está cada sucursal en Wellhub y TotalPass."""
  staff_de_sesion(request, roles=["direccion"])
  filas = supabase.table("sucursales").select("id, nombre, wellhub_gym_id, wellhub_product_id, totalpass_place_api_key, totalpass_plan_id")\
    .eq("estatus", "Activa").order("nombre").execute().data or []
  return {"sucursales": [{
    "id": f["id"], "sucursal": (f.get("nombre") or "").strip(),
    "wellhub": "listo" if f.get("wellhub_gym_id") and (f.get("wellhub_product_id") or wellhub_de(f["id"]) and wellhub_de(f["id"]).get("product_id"))
               else "falta producto" if f.get("wellhub_gym_id") else "no está",
    "totalpass": "listo" if f.get("totalpass_place_api_key") and f.get("totalpass_plan_id")
                 else "falta plan" if f.get("totalpass_place_api_key") else "no está",
  } for f in filas]}


@router.post("/configurar/{sucursal_id}")
async def configurar(sucursal_id: str, request: Request):
  """Deja lista una sucursal en Wellhub y TotalPass (se puede correr las veces que sea, no duplica nada)."""
  staff_de_sesion(request, roles=["direccion"])
  suc = supabase.table("sucursales").select("id, nombre, wellhub_gym_id, wellhub_product_id, totalpass_place_api_key, totalpass_plan_id")\
    .eq("id", sucursal_id).limit(1).execute().data
  if not suc:
    raise HTTPException(status_code=404, detail="Sucursal no encontrada")
  suc = suc[0]
  async with httpx.AsyncClient(timeout=30.0) as client:
    wh = await _wellhub(client, suc)
    tp = await _totalpass(client, suc)
  olvidar_cache()
  return {"sucursal": (suc.get("nombre") or "").strip(), "wellhub": wh, "totalpass": tp}