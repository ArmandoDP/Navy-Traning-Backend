from fastapi import APIRouter, HTTPException
import httpx
import os
from datetime import datetime, timedelta

router = APIRouter()

WELLHUB_BASE_URL = "https://api.partners.gympass.com"
WELLHUB_GYM_IDS  = {
    "1b2032dc-f5da-40c6-8c4e-e227be14673b": {"gym_id": "848637", "product_id": 953550},
    "f8f798a8-d89b-4874-a53a-cdcb6325ad2a": {"gym_id": "848638", "product_id": 953551},
}

def wellhub_headers():
    return {
        "Authorization": f"Bearer {os.getenv('WELLHUB_API_KEY')}",
        "Content-Type":  "application/json",
    }

@router.post("/actualizar-cupos")
async def actualizar_cupos_wellhub(req: dict):
    slot_id      = req.get("slot_id")
    clase_id     = req.get("clase_id")
    total_booked = req.get("total_booked", 0)
    sucursal_id  = req.get("sucursal_id")

    config = WELLHUB_GYM_IDS.get(sucursal_id)
    if not config:
        raise HTTPException(status_code=400, detail="Sucursal no configurada")
    gym_id = config["gym_id"]

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.patch(
            f"{WELLHUB_BASE_URL}/booking/v1/gyms/{gym_id}/classes/{clase_id}/slots/{slot_id}",
            headers=wellhub_headers(),
            json={"total_booked": total_booked},
        )
        print(f"Wellhub actualizar cupos: {res.status_code} {res.text}")

    return {"ok": True, "total_booked": total_booked}


@router.post("/actualizar-slot")
async def actualizar_slot_wellhub(req: dict):
    print("Wellhub actualizar-slot payload recibido:", req)
    slot_id          = req.get("slot_id")
    clase_id         = req.get("clase_id")
    sucursal_id      = req.get("sucursal_id")
    horario          = req.get("horario")
    duracion_minutos = req.get("duracion_minutos", 60)
    capacidad_max    = req.get("capacidad_max", 20)
    room             = req.get("room", "Sala Principal")

    config = WELLHUB_GYM_IDS.get(sucursal_id)
    if not config:
        raise HTTPException(status_code=400, detail="Sucursal no configurada")
    gym_id     = config["gym_id"]
    product_id = config["product_id"]

    if not horario:
        raise HTTPException(status_code=400, detail="horario requerido")

    # Convertir UTC → CDMX (UTC-6) y mandar con offset -06:00
    dt_utc  = datetime.fromisoformat(horario.replace("Z", "+00:00"))
    dt_cdmx = dt_utc - timedelta(hours=6)
    occur_date = dt_cdmx.strftime("%Y-%m-%dT%H:%M:%S") + "-06:00"

    payload = {
        "occur_date":        occur_date,
        "status":            1,
        "room":              room,
        "length_in_minutes": duracion_minutos,
        "total_capacity":    capacidad_max,
        "total_booked":      0,  # ← agrega esto
        "product_id":        product_id,
        "instructors":       [],
        "rate":              0,
    }

    print("Wellhub PUT payload:", payload)
    print("Wellhub PUT url:", f"{WELLHUB_BASE_URL}/booking/v1/gyms/{gym_id}/classes/{clase_id}/slots/{slot_id}")

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.put(
            f"{WELLHUB_BASE_URL}/booking/v1/gyms/{gym_id}/classes/{clase_id}/slots/{slot_id}",
            headers=wellhub_headers(),
            json=payload,
        )
        print(f"Wellhub actualizar slot: {res.status_code} {res.text}")

    return {"ok": True}