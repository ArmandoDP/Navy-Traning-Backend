from fastapi import APIRouter, HTTPException
import httpx
import os

router = APIRouter()

WELLHUB_GYM_IDS = {
    "1b2032dc-f5da-40c6-8c4e-e227be14673b": "848637",  # Condesa Gym
    "f8f798a8-d89b-4874-a53a-cdcb6325ad2a": "848638",  # Condesa Studio
}

@router.post("/actualizar-cupos")
async def actualizar_cupos_wellhub(req: dict):
    slot_id      = req.get("slot_id")
    clase_id     = req.get("clase_id")
    total_booked = req.get("total_booked", 0)
    sucursal_id  = req.get("sucursal_id")

    WELLHUB_API_KEY = os.getenv("WELLHUB_API_KEY")
    gym_id = WELLHUB_GYM_IDS.get(sucursal_id)
    if not gym_id:
        raise HTTPException(status_code=400, detail="Sucursal no configurada")

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.patch(
            f"https://api.partners.gympass.com/booking/v1/gyms/{gym_id}/classes/{clase_id}/slots/{slot_id}",
            headers={
                "Authorization": f"Bearer {WELLHUB_API_KEY}",
                "Content-Type":  "application/json",
            },
            json={"total_booked": total_booked},
        )
        print(f"Wellhub actualizar cupos: {res.status_code} {res.text}")

    return {"ok": True, "total_booked": total_booked}