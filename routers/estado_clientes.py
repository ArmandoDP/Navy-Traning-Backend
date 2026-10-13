# routers/estado_clientes.py  →  prefijo /clientes-estado
from fastapi import APIRouter, Request
from services.auth_app import staff_de_sesion
from services.estado_clientes import sincronizar_cliente, sincronizar_todos

router = APIRouter()


@router.post("/sincronizar/{cliente_id}")
async def sincronizar_uno(cliente_id: str, request: Request):
  """El CRM lo llama después de registrar un pago en efectivo, una migración o cancelar un plan."""
  staff_de_sesion(request)
  return {"ok": True, "cambios": sincronizar_cliente(cliente_id)}


@router.post("/sincronizar-todos")
async def sincronizar_todo(request: Request):
  """Recalcular a todos ahora (solo dirección)."""
  staff_de_sesion(request, roles=["direccion"])
  return {"ok": True, **(await sincronizar_todos())}