from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.supabase import supabase

router = APIRouter()

class PausaCanalRequest(BaseModel):
  membresia_id: str
  cliente_id: str
  canal: str
  dias_pausa: int
  nueva_fecha_fin: str

@router.post("/pausar-canal")
async def pausar_canal(req: PausaCanalRequest):
  try:
    print(f"⏸️ Pausa registrada para membresía {req.membresia_id} en canal {req.canal}")
    
    # Aquí puedes agregar lógica adicional si en el futuro necesitas 
    # pausar la suscripción directamente en la pasarela de pagos (Stripe / OrkestaPay).
    
    return {"ok": True, "mensaje": "Pausa de canal sincronizada correctamente"}
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))