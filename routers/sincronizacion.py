from fastapi           import APIRouter, HTTPException
from services.supabase import supabase
import httpx
import os

router = APIRouter()

TP_BASE = "https://booking-api.totalpass.com"
WH_BASE = "https://api.partners.gympass.com"

# Respaldo por si la base no responde. La fuente real es sucursales.wellhub_gym_id,
# así una sucursal nueva (Juriquilla, Santa Fe...) no requiere tocar código.
WELLHUB_GYM_IDS_RESPALDO = {
  "1b2032dc-f5da-40c6-8c4e-e227be14673b": "848637",  # Condesa Gym
  "f8f798a8-d89b-4874-a53a-cdcb6325ad2a": "848638",  # Condesa Studio
}


def config_sucursal(sucursal_id: str | None) -> dict:
  """Gym de Wellhub y llave de TotalPass de la sucursal, desde la base."""
  cfg = {"wellhub_gym_id": None, "totalpass_place_api_key": None}
  if not sucursal_id:
    return cfg
  try:
    suc = supabase.table("sucursales")\
      .select("wellhub_gym_id, totalpass_place_api_key")\
      .eq("id", sucursal_id).limit(1).execute()
    if suc.data:
      fila = suc.data[0]
      gym = str(fila.get("wellhub_gym_id") or "").strip()
      cfg["wellhub_gym_id"]          = gym or None
      cfg["totalpass_place_api_key"] = fila.get("totalpass_place_api_key")
  except Exception as e:
    print(f"⚠️ No se pudo leer la sucursal {sucursal_id}: {e}")

  if not cfg["wellhub_gym_id"]:
    cfg["wellhub_gym_id"] = WELLHUB_GYM_IDS_RESPALDO.get(sucursal_id)
  return cfg


async def sincronizar_cupos(clase_id: str) -> dict:
  """
  Fuente única de verdad para cupos.
  Cuenta las reservas activas en la BD y empuja el resultado a:
    - Supabase  -> clases.espacios_ocupados = total
    - Wellhub   -> total_booked = total
    - TotalPass -> slots = capacidad - reservas de OTROS canales
                   (TotalPass descuenta sus propias reservas en slotsInUse)
  """
  clase_res = supabase.table("clases")\
    .select("id, capacidad_max, sucursal_id, wellhub_slot_id, wellhub_class_id, totalpass_occurrence_uuid")\
    .eq("id", clase_id).limit(1).execute()
  if not clase_res.data:
    return {"ok": False, "error": "Clase no encontrada"}
  clase = clase_res.data[0]

  reservas_res = supabase.table("reservas").select("origen")\
    .eq("clase_id", clase_id).neq("estatus", "Cancelada").execute()
  reservas  = reservas_res.data or []
  total     = len(reservas)
  tp        = sum(1 for r in reservas if (r.get("origen") or "") == "TotalPass")
  otros     = total - tp
  capacidad = clase.get("capacidad_max") or 0

  resultado = {
    "ok":        True,
    "clase_id":  clase_id,
    "capacidad": capacidad,
    "total":     total,
    "totalpass": tp,
    "otros":     otros,
  }

  # 1. Supabase
  supabase.table("clases").update({"espacios_ocupados": total}).eq("id", clase_id).execute()

  cfg = config_sucursal(clase.get("sucursal_id"))

  async with httpx.AsyncClient(timeout=15.0) as client:

    # 2. Wellhub
    gym_id = cfg["wellhub_gym_id"]
    if clase.get("wellhub_slot_id") and clase.get("wellhub_class_id"):
      if not gym_id:
        resultado["wellhub"] = {"error": "Sucursal sin wellhub_gym_id"}
      else:
        try:
          r = await client.patch(
            f"{WH_BASE}/booking/v1/gyms/{gym_id}/classes/{clase['wellhub_class_id']}/slots/{clase['wellhub_slot_id']}",
            headers={
              "Authorization": f"Bearer {os.getenv('WELLHUB_API_KEY')}",
              "Content-Type":  "application/json",
            },
            json={"total_booked": min(total, capacidad)},
          )
          resultado["wellhub"] = {"status": r.status_code, "gym": gym_id, "total_booked": min(total, capacidad)}
          if r.status_code >= 400:
            resultado["wellhub"]["error"] = r.text[:200]
        except Exception as e:
          resultado["wellhub"] = {"error": str(e)}

    # 3. TotalPass
    uuid = clase.get("totalpass_occurrence_uuid")
    if uuid:
      try:
        place_key = cfg["totalpass_place_api_key"]

        if place_key:
          auth = await client.post(
            f"{TP_BASE}/partner/auth",
            json={
              "partner_api_key": os.getenv("TOTALPASS_PARTNER_API_KEY"),
              "place_api_key":   place_key,
            },
          )
          token = auth.json().get("token") if auth.status_code < 300 else None

          if not token:
            resultado["totalpass_sync"] = {"error": f"Auth TotalPass {auth.status_code}: {auth.text[:150]}"}
          else:
            # Límite de TotalPass = lo que no han ocupado los otros canales.
            # No puede ser menor a sus propias reservas, ni 0 (TotalPass lo rechaza).
            slots = max(capacidad - otros, tp, 1)

            r = await client.put(
              f"{TP_BASE}/partner/event-occurrence/{uuid}/slot",
              headers={
                "Authorization": f"Bearer {token}",
                "Content-Type":  "application/json",
                "accept":        "application/json",
              },
              json={"slots": slots},
            )
            resultado["totalpass_sync"] = {"status": r.status_code, "slots": slots}
            if r.status_code >= 400:
              resultado["totalpass_sync"]["error"] = r.text[:200]
        else:
          resultado["totalpass_sync"] = {"error": "Sucursal sin totalpass_place_api_key"}
      except Exception as e:
        resultado["totalpass_sync"] = {"error": str(e)}

  print(f"🔄 Sync cupos {clase_id}: {resultado}")
  return resultado


@router.post("/cupos")
async def sync_cupos(req: dict):
  clase_id = req.get("clase_id")
  if not clase_id:
    raise HTTPException(status_code=400, detail="clase_id requerido")
  return await sincronizar_cupos(clase_id)