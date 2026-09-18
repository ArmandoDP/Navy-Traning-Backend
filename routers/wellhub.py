from fastapi import APIRouter, HTTPException
import httpx
import os

router = APIRouter()

WELLHUB_BASE_URL = "https://api.partners.gympass.com"
WELLHUB_GYM_IDS  = {
    "1b2032dc-f5da-40c6-8c4e-e227be14673b": "848637",  # Condesa Gym
    "f8f798a8-d89b-4874-a53a-cdcb6325ad2a": "848638",  # Condesa Studio
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

    gym_id = WELLHUB_GYM_IDS.get(sucursal_id)
    if not gym_id:
        raise HTTPException(status_code=400, detail="Sucursal no configurada")

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
    duracion_minutos = req.get("duracion_minutos")
    capacidad_max    = req.get("capacidad_max")

    gym_id = WELLHUB_GYM_IDS.get(sucursal_id)
    if not gym_id:
        raise HTTPException(status_code=400, detail="Sucursal no configurada")

    payload = {}
    if horario:
        # Mandar UTC con Z — igual que al crear
        from datetime import datetime
        dt = datetime.fromisoformat(horario.replace("Z", "+00:00"))
        payload["occur_date"] = dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    if duracion_minutos:
        payload["length_in_minutes"] = duracion_minutos
    if capacidad_max:
        payload["total_capacity"] = capacidad_max

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.patch(
            f"{WELLHUB_BASE_URL}/booking/v1/gyms/{gym_id}/classes/{clase_id}/slots/{slot_id}",
            headers=wellhub_headers(),
            json=payload,
        )
        print(f"Wellhub actualizar slot: {res.status_code} {res.text}")

    return {"ok": True}