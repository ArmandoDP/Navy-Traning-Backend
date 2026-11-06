# services/planes.py — cada hora:
#  1. cierra los planes que terminaron (por fecha o por clases) y hace entrar al siguiente de la fila (regla en la base)
#  2. a los planes reemplazados por uno nuevo, les dice a Stripe "no renovar": terminan en su fecha y ya no se cobran
import os
import stripe
from datetime import datetime, timezone
from services.supabase import supabase

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")


def _no_renovar_reemplazados() -> int:
  pendientes = supabase.table("membresias").select("id, stripe_subscription_id, notas") \
    .eq("cancelar_renovacion", True).is_("renovacion_cancelada_at", "null").limit(200).execute().data or []
  hechos = 0
  for m in pendientes:
    sub_id = m.get("stripe_subscription_id")
    try:
      if sub_id:
        sub = stripe.Subscription.retrieve(sub_id)
        if sub.status in ("active", "trialing", "past_due") and not sub.cancel_at_period_end:
          stripe.Subscription.modify(sub_id, cancel_at_period_end=True,
                                     metadata={**(sub.metadata or {}), "no_renovar": "lo reemplazó un plan nuevo"})
      supabase.table("membresias").update({
        "cancelar_renovacion": False,
        "renovacion_cancelada_at": datetime.now(timezone.utc).isoformat(),
        "notas": ((m.get("notas") or "") + " · " if m.get("notas") else "") + "No se renueva: lo reemplazó un plan nuevo",
      }).eq("id", m["id"]).execute()
      hechos += 1
    except Exception as e:
      print(f"no renovar {sub_id}:", e)
  return hechos


async def avanzar_planes() -> dict:
  r = {}
  try:
    r = supabase.rpc("avanzar_planes").execute().data or {}
  except Exception as e:
    print("avanzar_planes:", e)
  try:
    r = {**(r if isinstance(r, dict) else {}), "renovaciones_canceladas": _no_renovar_reemplazados()}
  except Exception as e:
    print("no renovar reemplazados:", e)
  print(f"🔁 Planes: {r}")
  return r