# services/tarjetas.py — la tarjeta guardada de cada cliente, siempre al día en su ficha
from datetime import datetime, timedelta, timezone
import stripe
from services.supabase import supabase
from services import stripe_service as ss

CDMX = timezone(timedelta(hours=-6))
BILLETERAS = {"apple_pay": "Apple Pay", "google_pay": "Google Pay"}


def tarjeta_de(cliente_id: str) -> dict | None:
  """La tarjeta principal del cliente en Stripe (o None)."""
  cus = ss._customer_existente(cliente_id)
  pm_id = ss.tarjeta_principal(cus) if cus else None
  if not pm_id:
    return None
  pm = stripe.PaymentMethod.retrieve(pm_id)
  card = pm.get("card") or {}
  billetera = BILLETERAS.get((card.get("wallet") or {}).get("type") or "")
  marca = (card.get("brand") or "tarjeta").capitalize()
  return {"id": pm_id, "marca": f"{billetera} · {marca}" if billetera else marca, "ultimos4": card.get("last4")}


def actualizar_tarjeta(cliente_id: str) -> dict | None:
  """Guarda en la ficha si tiene tarjeta y cuál. Se llama cuando Stripe confirma un pago o una tarjeta nueva."""
  if not cliente_id:
    return None
  try:
    t = tarjeta_de(cliente_id)
    supabase.table("clientes").update({
      "tarjeta_guardada": bool(t),
      "tarjeta_marca": t["marca"] if t else None,
      "tarjeta_ultimos4": t["ultimos4"] if t else None,
      "tarjeta_actualizada_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", cliente_id).execute()
    return t
  except Exception as e:
    print(f"tarjetas {cliente_id}:", e)
    return None


def actualizar_todas():
  """Para correr una vez: revisa a todos los clientes que ya tienen cliente de Stripe."""
  filas = supabase.table("clientes").select("id").not_.is_("stripe_customer_id", "null").execute().data or []
  con = 0
  for f in filas:
    if actualizar_tarjeta(f["id"]):
      con += 1
  print(f"💳 Tarjetas revisadas: {len(filas)} clientes de Stripe · {con} con tarjeta guardada")
  return {"revisados": len(filas), "con_tarjeta": con}


async def recordatorio_tarjeta():
  """Diario 11:00 CDMX: a quien no tiene tarjeta y su plan vence en 3 días."""
  from services.stripe_activacion import push_cliente
  objetivo = (datetime.now(CDMX).date() + timedelta(days=3)).isoformat()
  filas = supabase.table("membresias").select("cliente_id, fecha_fin, paquetes(nombre), clientes!inner(tarjeta_guardada)")\
    .eq("estatus", "Activa").eq("fecha_fin", objetivo).eq("clientes.tarjeta_guardada", False).execute().data or []
  for f in filas:
    plan = (f.get("paquetes") or {}).get("nombre", "tu plan")
    await push_cliente(f["cliente_id"], "Tu plan termina en 3 días",
      f"Agrega tu tarjeta en la app y renueva {plan} sin pasar a recepción.", {"tipo": "agregar_tarjeta"})
  print(f"💳 Recordatorios de tarjeta: {len(filas)}")


if __name__ == "__main__":
  actualizar_todas()