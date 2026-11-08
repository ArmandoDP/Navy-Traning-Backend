# services/stripe_cuentas.py — una cuenta de Stripe por sucursal
#
# Todo el código sigue escribiendo stripe.Algo.create(...) como siempre. Este módulo decide con QUÉ LLAVE sale
# cada llamada, según la cuenta de la operación en curso (cada petición / tarea lleva la suya, sin mezclarse).
#
#   with usar_cuenta("lomas"): ...            → todo lo de adentro sale con la llave de Lomas
#   @con_cuenta(lambda cliente_id, ...: ...)  → la función entera corre en la cuenta que regresa la lambda
#
# Condesa es la cuenta donde ya vive todo lo de antes (clientes, tarjetas, suscripciones y pagos). Se configura
# igual que las demás (STRIPE_SK_CONDESA, STRIPE_PK_CONDESA, STRIPE_WH_CONDESA y /stripe/webhook/condesa), y por
# dentro es "la principal": usa los clientes de Stripe que ya están en clientes.stripe_customer_id.
#
# Interruptor en Railway: STRIPE_CUENTAS_ACTIVAS = "interlomas-studio,lomas"  (vacío = todo en Condesa).
# Solo las cuentas de esa lista (y con sus llaves puestas) reciben cobros NUEVOS. Lo que ya existe en una cuenta
# (suscripciones, pagos, links) siempre se maneja en la cuenta donde quedó guardado.
import os, time, types, asyncio, functools, contextlib, contextvars
import stripe
from services.supabase import supabase

PRINCIPAL = "principal"
CUENTA_PRINCIPAL = "condesa"        # la cuenta "de siempre": por dentro se llama principal
CUENTAS = {                         # nombre corto  →  sufijo de las variables STRIPE_SK_ / STRIPE_PK_ / STRIPE_WH_
  "condesa":           "CONDESA",
  "interlomas-studio": "INTERLOMAS_STUDIO",
  "interlomas-gym":    "INTERLOMAS_GYM",
  "lomas":             "LOMAS",
  "juriquilla":        "JURIQUILLA",
  "refugio":           "REFUGIO",
  "santa-fe":          "SANTA_FE",
}

_cuenta = contextvars.ContextVar("navy_stripe_cuenta", default=PRINCIPAL)
_principal = {"llave": os.getenv("STRIPE_SECRET_KEY")}


# Variables viejas de la cuenta de siempre (si no está la de Condesa, se usan estas)
_VIEJAS = {"SK": "STRIPE_SECRET_KEY", "PK": "STRIPE_PUBLISHABLE_KEY", "WH": "STRIPE_WEBHOOK_SECRET"}


def normal(cuenta: str | None) -> str:
  """'condesa' y 'principal' son la misma cuenta."""
  c = (cuenta or PRINCIPAL).strip().lower()
  return PRINCIPAL if c in (PRINCIPAL, CUENTA_PRINCIPAL) else c


def _env(tipo: str, cuenta: str) -> str | None:
  c = normal(cuenta)
  if c == PRINCIPAL:
    return (os.getenv(f"STRIPE_{tipo}_{CUENTAS[CUENTA_PRINCIPAL]}") or os.getenv(_VIEJAS[tipo]) or "").strip() or None
  if c not in CUENTAS:
    return None
  return (os.getenv(f"STRIPE_{tipo}_{CUENTAS[c]}") or "").strip() or None


def tiene_llaves(cuenta: str) -> bool:
  return normal(cuenta) == PRINCIPAL or bool(_env("SK", cuenta))


def activas() -> set[str]:
  return {c.strip().lower() for c in (os.getenv("STRIPE_CUENTAS_ACTIVAS") or "").split(",") if c.strip()}


def llave(cuenta: str | None = None) -> str | None:
  c = normal(cuenta or _cuenta.get())
  if c == PRINCIPAL:
    return (os.getenv("STRIPE_SK_CONDESA") or "").strip() or _principal["llave"]
  return _env("SK", c) or _principal["llave"]


# ── La llave de stripe.api_key depende de la cuenta en curso ──
class _StripeConCuentas(types.ModuleType):
  @property
  def api_key(self):
    return llave()

  @api_key.setter
  def api_key(self, valor):            # el código viejo hace stripe.api_key = os.getenv(...): esa es la principal
    _principal["llave"] = valor


if not isinstance(stripe, _StripeConCuentas):
  stripe.__class__ = _StripeConCuentas


# ── Cuenta en curso ──
def cuenta_actual() -> str:
  return _cuenta.get()


@contextlib.contextmanager
def usar_cuenta(cuenta: str | None):
  token = _cuenta.set(normal(cuenta))
  try:
    yield
  finally:
    _cuenta.reset(token)


def fijar_cuenta(cuenta: str | None):
  """Para el resto de esta petición (solo dentro de un endpoint)."""
  _cuenta.set(normal(cuenta))


def con_cuenta(resolver):
  """La función entera corre en la cuenta que regresa resolver(*args, **kwargs)."""
  def deco(fn):
    if asyncio.iscoroutinefunction(fn):
      @functools.wraps(fn)
      async def envuelta(*a, **k):
        with usar_cuenta(resolver(*a, **k)):
          return await fn(*a, **k)
    else:
      @functools.wraps(fn)
      def envuelta(*a, **k):
        with usar_cuenta(resolver(*a, **k)):
          return fn(*a, **k)
    return envuelta
  return deco


# ── ¿Qué cuenta le toca? ──
_cache_suc: dict = {}


def cuenta_de_sucursal(sucursal_id: str | None) -> str:
  """Cuenta para un cobro NUEVO en esa sucursal (principal si la sucursal no está activa o no tiene llaves)."""
  if not sucursal_id:
    return PRINCIPAL
  hit = _cache_suc.get(sucursal_id)
  if not hit or time.time() - hit[1] > 300:
    try:
      fila = supabase.table("sucursales").select("stripe_cuenta").eq("id", sucursal_id).limit(1).execute().data
      slug = ((fila[0].get("stripe_cuenta") if fila else None) or "").strip().lower()
    except Exception as e:
      print("stripe_cuentas sucursal:", e)
      slug = ""
    hit = (slug, time.time())
    _cache_suc[sucursal_id] = hit
  slug = normal(hit[0])
  if slug == PRINCIPAL:
    return PRINCIPAL                  # Condesa: siempre, es la cuenta de siempre
  return slug if slug in CUENTAS and slug in activas() and tiene_llaves(slug) else PRINCIPAL


def cuenta_de_cliente(cliente_id: str | None) -> str:
  if not cliente_id:
    return PRINCIPAL
  try:
    c = supabase.table("clientes").select("sucursal_id").eq("id", cliente_id).limit(1).execute().data
    return cuenta_de_sucursal(c[0].get("sucursal_id") if c else None)
  except Exception:
    return PRINCIPAL


def cuenta_de_suscripcion(sub_id: str | None) -> str:
  """En qué cuenta vive una suscripción que ya existe."""
  if not sub_id:
    return PRINCIPAL
  try:
    m = supabase.table("membresias").select("stripe_cuenta").eq("stripe_subscription_id", sub_id)\
      .not_.is_("stripe_cuenta", "null").limit(1).execute().data
    if m and m[0].get("stripe_cuenta"):
      return normal(m[0]["stripe_cuenta"])
    c = supabase.table("clientes").select("stripe_subscription_cuenta").eq("stripe_subscription_id", sub_id).limit(1).execute().data
    if c and c[0].get("stripe_subscription_cuenta"):
      return normal(c[0]["stripe_subscription_cuenta"])
  except Exception as e:
    print("stripe_cuentas suscripción:", e)
  return PRINCIPAL


def publicable(cuenta: str | None = None) -> str | None:
  """Llave pública de la cuenta (None = la app usa la suya, la de Condesa)."""
  return _env("PK", cuenta or _cuenta.get())


def secreto_webhook(cuenta: str) -> str | None:
  return _env("WH", cuenta)


def configuradas() -> list[str]:
  return [PRINCIPAL] + [c for c in CUENTAS if normal(c) != PRINCIPAL and tiene_llaves(c)]


# ── El cliente de Stripe es uno por cuenta ──
def customer_guardado(cliente_id: str, cuenta: str | None = None) -> str | None:
  c = normal(cuenta or _cuenta.get())
  if c == PRINCIPAL:
    f = supabase.table("clientes").select("stripe_customer_id").eq("id", cliente_id).limit(1).execute().data
    return (f[0].get("stripe_customer_id") if f else None) or None
  f = supabase.table("cliente_stripe").select("customer_id").eq("cliente_id", cliente_id).eq("cuenta", c).limit(1).execute().data
  return (f[0].get("customer_id") if f else None) or None


def guardar_customer(cliente_id: str, customer_id: str | None, cuenta: str | None = None):
  if not cliente_id or not customer_id:
    return
  c = normal(cuenta or _cuenta.get())
  if c == PRINCIPAL:
    supabase.table("clientes").update({"stripe_customer_id": customer_id}).eq("id", cliente_id).execute()
  else:
    supabase.table("cliente_stripe").upsert({"cliente_id": cliente_id, "cuenta": c, "customer_id": customer_id},
                                            on_conflict="cliente_id,cuenta").execute()


# ── Buscar un pago/sesión sin saber en qué cuenta quedó ──
def _no_existe(e: Exception) -> bool:
  return isinstance(e, stripe.error.InvalidRequestError) and (getattr(e, "code", None) == "resource_missing" or "No such" in str(e))


def recuperar_en_cuentas(fn, *a, cuenta: str | None = None, **k):
  """Intenta en la cuenta indicada (o en la actual), y si no existe ahí, en las demás. Regresa (objeto, cuenta)."""
  primero = normal(cuenta or _cuenta.get())
  orden = [primero] + [c for c in configuradas() if c != primero]
  ultimo = None
  for c in orden:
    with usar_cuenta(c):
      try:
        return fn(*a, **k), c
      except Exception as e:
        if not _no_existe(e):
          raise
        ultimo = e
  raise ultimo