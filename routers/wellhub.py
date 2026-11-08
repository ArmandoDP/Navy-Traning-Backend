from fastapi import APIRouter, HTTPException
import httpx
import os
from datetime import datetime, timedelta

router = APIRouter()

WELLHUB_BASE_URL = "https://api.partners.gympass.com"
from services.plataformas import wellhub_de   # gym y producto de Wellhub de cada sucursal, desde la base

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

    config = wellhub_de(sucursal_id)
    if not config:
        raise HTTPException(status_code=400, detail="Esta sucursal no está en Wellhub")
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
    coach            = req.get("coach")

    config = wellhub_de(sucursal_id)
    if not config:
        raise HTTPException(status_code=400, detail="Esta sucursal no está en Wellhub")
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
        "instructors":       [{"name": coach, "substitute": False}] if coach else [],
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


@router.post("/eliminar-slot")
async def eliminar_slot_wellhub(req: dict):
    slot_id     = req.get("slot_id")
    clase_id    = req.get("clase_id")
    sucursal_id = req.get("sucursal_id")

    config = wellhub_de(sucursal_id)
    if not config:
        raise HTTPException(status_code=400, detail="Esta sucursal no está en Wellhub")
    gym_id = config["gym_id"]

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.delete(
            f"{WELLHUB_BASE_URL}/booking/v1/gyms/{gym_id}/classes/{clase_id}/slots/{slot_id}",
            headers=wellhub_headers(),
        )
        print(f"Wellhub eliminar slot: {res.status_code} {res.text}")

    return {"ok": True, "status": res.status_code}

@router.get("/listar-clases")
async def listar_clases_wellhub(sucursal_id: str, fecha: str):
    config = wellhub_de(sucursal_id)
    if not config:
        raise HTTPException(status_code=400, detail="Esta sucursal no está en Wellhub")
    gym_id = config["gym_id"]
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.get(
            f"{WELLHUB_BASE_URL}/booking/v1/gyms/{gym_id}/classes",
            headers=wellhub_headers(),
            params={"date": fecha},
        )
        return res.json()