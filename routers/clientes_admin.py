# routers/clientes_admin.py  →  prefijo /clientes-admin   (solo dirección)
# Eliminar un cliente por completo, o unir un duplicado con la cuenta buena.
from datetime import datetime, timezone
import stripe
from fastapi import APIRouter, HTTPException, Request
from services.supabase import supabase
from services.auth_app import staff_de_sesion

router = APIRouter()


def _cliente(cid: str) -> dict:
  c = supabase.table("clientes").select("*").eq("id", cid).limit(1).execute().data
  if not c:
    raise HTTPException(status_code=404, detail="Cliente no encontrado")
  return c[0]


def _contar(tabla: str, cid: str, **filtros) -> int:
  q = supabase.table(tabla).select("id", count="exact").eq("cliente_id", cid)
  for k, v in filtros.items():
    q = q.eq(k, v)
  return q.execute().count or 0


def _log(staff: dict, tipo: str, descripcion: str, metadata: dict):
  quien = " ".join(f"{staff.get('nombre') or ''} {staff.get('primer_apellido') or ''}".split())
  supabase.table("actividad_log").insert({
    "tipo": tipo, "tabla": "clientes", "accion": "DELETE", "descripcion": f"{quien} {descripcion}",
    "metadata": metadata, "staff_id": staff.get("id"),
  }).execute()


def _suscripcion_activa(sub_id: str | None) -> dict | None:
  if not sub_id:
    return None
  try:
    s = stripe.Subscription.retrieve(sub_id)
    return s if s.status in ("active", "trialing", "past_due", "unpaid") else None
  except Exception:
    return None


@router.get("/{cliente_id}/resumen")
async def resumen(cliente_id: str, request: Request):
  """Qué tiene el cliente, antes de eliminarlo o unirlo."""
  staff_de_sesion(request, roles=["direccion"])
  c = _cliente(cliente_id)
  hoy = datetime.now(timezone.utc).isoformat()
  futuras = supabase.table("reservas").select("id, clases!inner(horario)", count="exact").eq("cliente_id", cliente_id)\
    .neq("estatus", "Cancelada").gte("clases.horario", hoy).execute().count or 0
  sub = _suscripcion_activa(c.get("stripe_subscription_id"))
  return {
    "nombre": c.get("nombre_completo"), "email": c.get("email"),
    "reservas": _contar("reservas", cliente_id), "reservas_futuras": futuras,
    "membresias": _contar("membresias", cliente_id), "membresias_activas": _contar("membresias", cliente_id, estatus="Activa"),
    "pagos": _contar("pagos", cliente_id), "asistencias": _contar("asistencias", cliente_id),
    "suscripcion_activa": bool(sub), "tiene_acceso_app": bool(c.get("supabase_user_id")),
  }


@router.post("/{cliente_id}/eliminar")
async def eliminar(cliente_id: str, request: Request):
  staff = staff_de_sesion(request, roles=["direccion"])
  b = await request.json()
  c = _cliente(cliente_id)
  if (b.get("confirmacion") or "").strip().lower() != (c.get("email") or "").strip().lower():
    raise HTTPException(status_code=400, detail="Para confirmar, escribe el correo del cliente exactamente.")

  # Que Stripe deje de cobrarle
  sub = _suscripcion_activa(c.get("stripe_subscription_id"))
  if sub:
    try:
      stripe.Subscription.cancel(sub.id)
    except Exception as e:
      raise HTTPException(status_code=400, detail=f"No se pudo cancelar su suscripción en Stripe: {e}. Cancélala a mano y reintenta.")

  try:
    detalle = supabase.rpc("eliminar_cliente", {"p_cliente": cliente_id}).execute().data
  except Exception as e:
    raise HTTPException(status_code=400, detail=f"No se pudo eliminar: {str(e)[:200]}")
  _log(staff, "cliente_eliminado", f"eliminó por completo a {c.get('nombre_completo')} ({c.get('email')})",
       {"cliente_id": cliente_id, "email": c.get("email"), "borrado": detalle, "suscripcion_cancelada": sub.id if sub else None})
  return {"ok": True, "borrado": detalle}


@router.post("/{cliente_id}/unir")
async def unir(cliente_id: str, request: Request):
  """Mueve todo de este cliente (el duplicado) a la cuenta buena, y borra el duplicado."""
  staff = staff_de_sesion(request, roles=["direccion"])
  b = await request.json()
  destino_id = b.get("destino_id")
  if not destino_id or destino_id == cliente_id:
    raise HTTPException(status_code=400, detail="Elige la cuenta buena, distinta a esta.")
  e = _cliente(cliente_id)
  k = _cliente(destino_id)

  # Si el duplicado paga una suscripción en Stripe, que sus renovaciones lleguen a la cuenta buena
  if e.get("stripe_subscription_id"):
    try:
      stripe.Subscription.modify(e["stripe_subscription_id"], metadata={"cliente_id": destino_id})
    except Exception as ex:
      print("unir suscripción:", ex)
  if e.get("stripe_customer_id") and not k.get("stripe_customer_id"):
    try:
      stripe.Customer.modify(e["stripe_customer_id"], metadata={"cliente_id": destino_id})
    except Exception as ex:
      print("unir customer:", ex)

  try:
    detalle = supabase.rpc("unir_clientes", {"p_conservar": destino_id, "p_eliminar": cliente_id}).execute().data
  except Exception as ex:
    raise HTTPException(status_code=400, detail=f"No se pudo unir: {str(ex)[:200]}")
  _log(staff, "clientes_unidos", f"unió a {e.get('email')} con {k.get('email')} ({k.get('nombre_completo')})",
       {"conservado": destino_id, "eliminado": cliente_id, "email_eliminado": e.get("email"), "movido": detalle})
  try:
    from services.estado_clientes import sincronizar_cliente
    sincronizar_cliente(destino_id)
  except Exception:
    pass
  return {"ok": True, "movido": detalle, "destino": {"id": destino_id, "nombre": k.get("nombre_completo"), "email": k.get("email")}}