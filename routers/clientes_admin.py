# routers/clientes_admin.py  →  prefijo /clientes-admin   (solo dirección)
# Eliminar un cliente por completo, o unir un duplicado con la cuenta buena.
from datetime import datetime, timezone
import stripe
from fastapi import APIRouter, HTTPException, Request
from services.supabase import supabase
from services.auth_app import staff_de_sesion
from services import stripe_service  # noqa: F401  (configura Stripe)
from services.stripe_cuentas import usar_cuenta, cuenta_de_suscripcion, PRINCIPAL

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
    with usar_cuenta(cuenta_de_suscripcion(sub_id)):        # en la cuenta donde vive
      s = stripe.Subscription.retrieve(sub_id)
    return s if s.status in ("active", "trialing", "past_due", "unpaid") else None
  except Exception:
    return None


def _suscripciones_vivas(c: dict) -> list:
  """Todas sus suscripciones vivas, de cualquier cuenta (la de su ficha y las de sus planes)."""
  ids = {c.get("stripe_subscription_id")} | {m["stripe_subscription_id"] for m in (supabase.table("membresias")
         .select("stripe_subscription_id").eq("cliente_id", c["id"]).not_.is_("stripe_subscription_id", "null")
         .in_("estatus", ["Activa", "En fila", "Pausada"]).execute().data or [])}
  return [s for s in (_suscripcion_activa(i) for i in ids if i) if s]


@router.get("/{cliente_id}/resumen")
async def resumen(cliente_id: str, request: Request):
  """Qué tiene el cliente, antes de eliminarlo o unirlo."""
  staff_de_sesion(request, roles=["direccion"])
  c = _cliente(cliente_id)
  hoy = datetime.now(timezone.utc).isoformat()
  futuras = supabase.table("reservas").select("id, clases!inner(horario)", count="exact").eq("cliente_id", cliente_id)\
    .neq("estatus", "Cancelada").gte("clases.horario", hoy).execute().count or 0
  sub = bool(_suscripciones_vivas(c))
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

  # Que Stripe deje de cobrarle, en todas las cuentas
  canceladas = []
  for sub in _suscripciones_vivas(c):
    try:
      with usar_cuenta(cuenta_de_suscripcion(sub.id)):
        stripe.Subscription.cancel(sub.id)
      canceladas.append(sub.id)
    except Exception as e:
      raise HTTPException(status_code=400, detail=f"No se pudo cancelar su suscripción {sub.id} en Stripe: {e}. Cancélala a mano y reintenta.")

  try:
    detalle = supabase.rpc("eliminar_cliente", {"p_cliente": cliente_id}).execute().data
  except Exception as e:
    raise HTTPException(status_code=400, detail=f"No se pudo eliminar: {str(e)[:200]}")
  _log(staff, "cliente_eliminado", f"eliminó por completo a {c.get('nombre_completo')} ({c.get('email')})",
       {"cliente_id": cliente_id, "email": c.get("email"), "borrado": detalle, "suscripciones_canceladas": canceladas})
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

  # Si el duplicado paga suscripciones en Stripe (en cualquier cuenta), que sus renovaciones lleguen a la cuenta buena
  for sub in _suscripciones_vivas(e):
    try:
      with usar_cuenta(cuenta_de_suscripcion(sub.id)):
        stripe.Subscription.modify(sub.id, metadata={**(sub.metadata or {}), "cliente_id": destino_id})
    except Exception as ex:
      print("unir suscripción:", ex)
  if e.get("stripe_customer_id") and not k.get("stripe_customer_id"):
    try:
      with usar_cuenta(PRINCIPAL):
        stripe.Customer.modify(e["stripe_customer_id"], metadata={"cliente_id": destino_id})
    except Exception as ex:
      print("unir customer:", ex)
  # Sus clientes de Stripe en las cuentas de las sucursales pasan a la cuenta buena (si ahí no tenía)
  try:
    ya = {r["cuenta"] for r in (supabase.table("cliente_stripe").select("cuenta").eq("cliente_id", destino_id).execute().data or [])}
    for r in supabase.table("cliente_stripe").select("cuenta, customer_id").eq("cliente_id", cliente_id).execute().data or []:
      if r["cuenta"] not in ya:
        supabase.table("cliente_stripe").update({"cliente_id": destino_id}).eq("cliente_id", cliente_id).eq("cuenta", r["cuenta"]).execute()
        with usar_cuenta(r["cuenta"]):
          stripe.Customer.modify(r["customer_id"], metadata={"cliente_id": destino_id})
  except Exception as ex:
    print("unir clientes de Stripe:", ex)

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