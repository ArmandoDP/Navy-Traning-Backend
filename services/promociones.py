# services/promociones.py — el precio con promoción. Un solo lugar para la app, el CRM y los cobros.
# Reglas: se aplica sola (sin códigos) · nunca se suman: gana la que deja el precio más bajo ·
# si el cliente ya tiene un precio especial más bajo (Founding), se queda con el suyo.
from datetime import datetime, timezone
import stripe
from services.supabase import supabase

MESES_TXT = {1: "el primer mes", 2: "los primeros 2 meses", 3: "los primeros 3 meses"}


def dinero(n: float) -> str:
  return f"${n:,.0f}"


def _vigentes(sucursal_id: str | None) -> list[dict]:
  ahora = datetime.now(timezone.utc).isoformat()
  promos = supabase.table("promociones").select("*").eq("activa", True).execute().data or []
  out = []
  for p in promos:
    if p.get("inicia") and p["inicia"] > ahora: continue
    if p.get("termina") and p["termina"] < ahora: continue
    if p.get("sucursales") and sucursal_id and sucursal_id not in p["sucursales"]: continue
    if p.get("usos_maximos"):
      usados = supabase.table("promocion_usos").select("id", count="exact").eq("promocion_id", p["id"]).eq("estatus", "aplicado").execute().count or 0
      if usados >= p["usos_maximos"]: continue
    out.append(p)
  return out


def _es_nuevo(cliente_id: str | None) -> bool:
  """Nuevo = nunca ha pagado un plan (puede haber tomado clase muestra)."""
  if not cliente_id:
    return True
  return not (supabase.table("pagos").select("id").eq("cliente_id", cliente_id).eq("estatus", "Completado")
              .gt("monto", 0).limit(1).execute().data)


def _aplica_a_cliente(p: dict, cli: dict | None) -> bool:
  if p["audiencia"] == "todos":  return True
  if p["audiencia"] == "staff":  return bool(cli and cli.get("es_staff"))
  if p["audiencia"] == "nuevos": return _es_nuevo(cli["id"] if cli else None)
  return False


def precio_con(p: dict, base: float) -> float:
  v = float(p["valor"])
  final = base * (1 - v / 100) if p["tipo"] == "porcentaje" else base - v if p["tipo"] == "monto" else v
  return round(max(0.0, min(base, final)), 2)


def texto_cliente(p: dict, base: float, final: float, recurrente: bool) -> str:
  """Lo que lee el cliente: "$1,800 el primer mes. Después, $2,000 al mes." """
  if not recurrente or p["duracion"] == "siempre":
    return f"{p.get('mensaje') or 'Precio especial'}: {dinero(final)}" + ("" if not recurrente else " mientras mantengas tu plan")
  cuando = MESES_TXT.get(p.get("meses") or 1, f"los primeros {p.get('meses')} meses") if p["duracion"] == "meses" else "el primer mes"
  return f"{p.get('mensaje') or 'Precio especial'}: {dinero(final)} {cuando}. Después, {dinero(base)}."


def mejor_promocion(cliente_id: str | None, item_tipo: str, item_id: str, sucursal_id: str | None,
                    base: float, recurrente: bool = False, _cache: dict | None = None) -> dict | None:
  """La promoción que deja el precio más bajo para este cliente y artículo (o None)."""
  if base <= 0:
    return None
  cache = _cache if _cache is not None else {}
  if "promos" not in cache:
    cache["promos"] = _vigentes(sucursal_id)
    ids = [p["id"] for p in cache["promos"]]
    cache["items"] = {}
    if ids:
      for it in supabase.table("promocion_items").select("*").in_("promocion_id", ids).execute().data or []:
        cache["items"].setdefault((it["item_tipo"], it["item_id"]), []).append(it["promocion_id"])
    cache["cli"] = supabase.table("clientes").select("id, es_staff, precio_bloqueado").eq("id", cliente_id).limit(1).execute().data[0] \
      if cliente_id else None
  candidatas = [p for p in cache["promos"] if p["id"] in cache["items"].get((item_tipo, item_id), [])
                and _aplica_a_cliente(p, cache["cli"])]
  if not candidatas:
    return None
  mejor = min(candidatas, key=lambda p: precio_con(p, base))
  final = precio_con(mejor, base)
  if final >= base:
    return None
  # El Founding con precio de por vida se queda con el suyo si es más bajo
  bloqueado = float((cache["cli"] or {}).get("precio_bloqueado") or 0)
  if item_tipo == "paquete" and bloqueado and bloqueado <= final:
    return None
  return {
    "promocion_id": mejor["id"], "nombre": mejor["nombre"], "mensaje": mejor.get("mensaje"),
    "precio_original": base, "precio_final": final, "descuento": round(base - final, 2),
    "duracion": mejor["duracion"], "meses": mejor.get("meses"),
    "texto": texto_cliente(mejor, base, final, recurrente),
  }


def cupon_stripe(promo: dict, paquete_id: str) -> str | None:
  """Cupón de Stripe para renovaciones: una vez, N meses o para siempre. Se crea una vez y se reutiliza."""
  monto = promo["descuento"]
  ya = supabase.table("promocion_cupones_stripe").select("cupon_id").eq("promocion_id", promo["promocion_id"])\
    .eq("paquete_id", paquete_id).eq("monto_desc", monto).limit(1).execute().data
  if ya:
    return ya[0]["cupon_id"]
  dur = {"primera": {"duration": "once"}, "siempre": {"duration": "forever"},
         "meses": {"duration": "repeating", "duration_in_months": promo.get("meses") or 1}}[promo["duracion"]]
  c = stripe.Coupon.create(amount_off=int(round(monto * 100)), currency="mxn", name=(promo.get("mensaje") or promo["nombre"])[:40],
                           metadata={"promocion_id": promo["promocion_id"], "paquete_id": paquete_id}, **dur)
  supabase.table("promocion_cupones_stripe").insert({"promocion_id": promo["promocion_id"], "paquete_id": paquete_id,
                                                     "monto_desc": monto, "cupon_id": c.id}).execute()
  return c.id


def registrar_uso(promo: dict, cliente_id: str | None, item_tipo: str, item_id: str, origen: str,
                  aplicado: bool = False, venta_id: str | None = None):
  try:
    supabase.table("promocion_usos").insert({
      "promocion_id": promo["promocion_id"], "cliente_id": cliente_id, "item_tipo": item_tipo, "item_id": item_id,
      "precio_original": promo["precio_original"], "precio_final": promo["precio_final"],
      "estatus": "aplicado" if aplicado else "pendiente", "venta_id": venta_id, "origen": origen,
    }).execute()
  except Exception as e:
    print("promoción uso:", e)