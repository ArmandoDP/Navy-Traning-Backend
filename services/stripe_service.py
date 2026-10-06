# services/stripe_service.py
# Todo lo que habla con la API de Stripe.
import os
import stripe
from datetime import date, datetime, timedelta, timezone
from services.supabase          import supabase
from services.stripe_activacion import _uno, membresia_activa, marcar_penalizacion_pagada, CDMX

stripe.api_key     = os.getenv("STRIPE_SECRET_KEY")
stripe.api_version = "2024-06-20"   # fijo para que los campos no cambien con versiones nuevas

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://crm.navytrainingcenter.com")


def centavos(monto) -> int:
  return int(round(float(monto) * 100))


def _meta(d: dict) -> dict:
  return {k: str(v) for k, v in d.items() if v is not None}


def _urls(origen: str) -> tuple[str, str]:
  return (
    f"{FRONTEND_URL}/pago/completado?session_id={{CHECKOUT_SESSION_ID}}&canal={origen}",
    f"{FRONTEND_URL}/pago/cancelado?canal={origen}",
  )


# ─── Clientes y tarjetas ─────────────────────────────────────────────────────
def get_or_create_customer(cliente_id: str) -> str:
  c = _uno("clientes", "id, nombre_completo, email, telefono, stripe_customer_id", id=cliente_id)
  if not c:
    raise ValueError("Cliente no encontrado")
  if c.get("stripe_customer_id"):
    try:
      cus = stripe.Customer.retrieve(c["stripe_customer_id"])
      if not cus.get("deleted"):
        return cus.id
    except stripe.error.InvalidRequestError:
      pass  # id viejo o de modo prueba: se crea uno nuevo
  cus = stripe.Customer.create(
    email=c.get("email"), name=c.get("nombre_completo"),
    phone=c.get("telefono") or None, metadata={"cliente_id": cliente_id},
  )
  supabase.table("clientes").update({"stripe_customer_id": cus.id}).eq("id", cliente_id).execute()
  return cus.id


def _customer_existente(cliente_id: str):
  c = _uno("clientes", "stripe_customer_id", id=cliente_id)
  if not c or not c.get("stripe_customer_id"):
    return None
  try:
    cus = stripe.Customer.retrieve(c["stripe_customer_id"])
    return None if cus.get("deleted") else cus
  except stripe.error.InvalidRequestError:
    return None


def tarjeta_principal(customer) -> str | None:
  default = (customer.get("invoice_settings") or {}).get("default_payment_method")
  if default:
    return default if isinstance(default, str) else default.id
  pms = stripe.PaymentMethod.list(customer=customer.id, type="card", limit=1)
  return pms.data[0].id if pms.data else None


def listar_tarjetas(cliente_id: str) -> list[dict]:
  cus = _customer_existente(cliente_id)
  if not cus:
    return []
  principal = tarjeta_principal(cus)
  pms = stripe.PaymentMethod.list(customer=cus.id, type="card", limit=20)
  return [{
    "id":        pm.id,
    "brand":     pm.card.brand,
    "last4":     pm.card.last4,
    "exp_month": pm.card.exp_month,
    "exp_year":  pm.card.exp_year,
    "principal": pm.id == principal,
  } for pm in pms.data]


def _verificar_duenio(cliente_id: str, pm_id: str):
  cus = _customer_existente(cliente_id)
  pm  = stripe.PaymentMethod.retrieve(pm_id)
  if not cus or pm.customer != cus.id:
    raise ValueError("La tarjeta no pertenece a este cliente")
  return cus, pm


def hacer_principal(cliente_id: str, pm_id: str):
  cus, _ = _verificar_duenio(cliente_id, pm_id)
  stripe.Customer.modify(cus.id, invoice_settings={"default_payment_method": pm_id})
  # Las suscripciones creadas con Checkout guardan su propia tarjeta: se actualizan también
  for estado in ("active", "trialing", "past_due"):
    for sub in stripe.Subscription.list(customer=cus.id, status=estado, limit=20).data:
      stripe.Subscription.modify(sub.id, default_payment_method=pm_id)


def eliminar_tarjeta(cliente_id: str, pm_id: str):
  _verificar_duenio(cliente_id, pm_id)
  stripe.PaymentMethod.detach(pm_id)


def comision_de(charge) -> float | None:
  """Comisión real que cobró Stripe (incluye el costo de MSI). None si aún no está disponible."""
  if not charge:
    return None
  try:
    if isinstance(charge, str):
      charge = stripe.Charge.retrieve(charge)
    bt = charge.get("balance_transaction")
    if not bt:
      return None
    if isinstance(bt, str):
      bt = stripe.BalanceTransaction.retrieve(bt)
    return (bt.get("fee") or 0) / 100
  except Exception as e:
    print("No se pudo leer la comisión:", e)
    return None


def etiqueta_metodo(charge) -> str:
  if not charge:
    return "Tarjeta"
  d = charge.get("payment_method_details") or {}
  tipo = d.get("type")
  if tipo == "oxxo":
    return "OXXO"
  if tipo == "card":
    c = d.get("card") or {}
    wallet = (c.get("wallet") or {}).get("type")
    base = {"apple_pay": "Apple Pay", "google_pay": "Google Pay"}.get(wallet) \
      or f"{(c.get('brand') or 'Tarjeta').capitalize()} •••• {c.get('last4', '')}"
    plan = (c.get("installments") or {}).get("plan")
    if plan and plan.get("count"):
      base += f" · {plan['count']} MSI"
    return base
  return tipo or "Tarjeta"


# ─── Precios ─────────────────────────────────────────────────────────────────
def precio_paquete(paquete: dict, sucursal_id: str | None) -> float:
  if sucursal_id:
    r = supabase.table("paquete_precios").select("precio_app")\
      .eq("paquete_id", paquete["id"]).eq("sucursal_id", sucursal_id).eq("activo", True)\
      .limit(1).execute()
    if r.data and r.data[0].get("precio_app"):
      return float(r.data[0]["precio_app"])
  return float(paquete.get("precio") or 0)


def intervalo(dias: int) -> dict:
  if dias in (360, 365, 366):
    return {"interval": "year", "interval_count": 1}
  if dias % 30 == 0 and dias // 30 <= 12:
    return {"interval": "month", "interval_count": dias // 30}
  if dias % 7 == 0:
    return {"interval": "week", "interval_count": dias // 7}
  return {"interval": "day", "interval_count": dias}


# ─── Checkouts ───────────────────────────────────────────────────────────────
def _sesion_pago(base: dict, msi: bool = True):
  """Intenta con MSI y guardando la tarjeta; si Stripe no acepta la combinación, simplifica."""
  intentos = []
  if msi:
    intentos.append({"card": {"installments": {"enabled": True}, "setup_future_usage": "off_session"}})
    intentos.append({"card": {"installments": {"enabled": True}}})
  intentos.append({"card": {"setup_future_usage": "off_session"}})
  intentos.append(None)
  ultimo = None
  for opts in intentos:
    try:
      kw = dict(base)
      if opts:
        kw["payment_method_options"] = opts
      return stripe.checkout.Session.create(**kw)
    except stripe.error.InvalidRequestError as e:
      print("Checkout: Stripe rechazó opciones", opts, "->", e.user_message or str(e))
      ultimo = e
  raise ultimo


def checkout_paquete(cliente_id: str, paquete_id: str, sucursal_id: str | None, origen: str) -> dict:
  paq = _uno("paquetes", "id, nombre, precio, vigencia_dias, es_recurrente, estatus", id=paquete_id)
  if not paq or (paq.get("estatus") and paq["estatus"] != "Activo"):
    raise ValueError("Este paquete no está disponible")
  cli = _uno("clientes", "id, sucursal_id", id=cliente_id)
  if not cli:
    raise ValueError("Cliente no encontrado")
  suc   = sucursal_id or cli.get("sucursal_id")
  monto = precio_paquete(paq, suc)
  memb  = membresia_activa(cliente_id)

  # Quien renueva el mismo paquete recurrente conserva su precio (fundadores)
  if paq.get("es_recurrente") and memb and memb.get("paquete_id") == paquete_id and memb.get("precio_pagado"):
    monto = float(memb["precio_pagado"])
  if monto <= 0:
    raise ValueError("El paquete no tiene precio en esta sucursal")

  customer = get_or_create_customer(cliente_id)
  meta = _meta({"tipo": "paquete", "cliente_id": cliente_id, "paquete_id": paquete_id,
                "sucursal_id": suc, "origen": origen, "monto": monto})
  ok_url, cancel_url = _urls(origen)
  producto = {"currency": "mxn", "unit_amount": centavos(monto),
              "product_data": {"name": paq["nombre"], "metadata": {"paquete_id": paquete_id}}}

  if paq.get("es_recurrente"):
    sub = {"metadata": meta, "description": f"{paq['nombre']} — Navy Training Center"}
    # Si ya tiene un plan activo, el primer cobro cae justo cuando termina (sin cobro doble)
    if memb and memb.get("fecha_fin"):
      arranque = datetime.combine(date.fromisoformat(memb["fecha_fin"]), datetime.min.time(), tzinfo=CDMX)
      if arranque - datetime.now(timezone.utc) > timedelta(hours=49):
        sub["trial_end"] = int(arranque.timestamp())
    s = stripe.checkout.Session.create(
      mode="subscription", customer=customer, client_reference_id=cliente_id,
      line_items=[{"price_data": {**producto, "recurring": intervalo(paq.get("vigencia_dias") or 30)}, "quantity": 1}],
      subscription_data=sub, metadata=meta, success_url=ok_url, cancel_url=cancel_url, locale="es",
    )
  else:
    s = _sesion_pago(dict(
      mode="payment", customer=customer, client_reference_id=cliente_id,
      line_items=[{"price_data": producto, "quantity": 1}], metadata=meta,
      payment_intent_data={"metadata": meta, "description": f"{paq['nombre']} — Navy Training Center"},
      success_url=ok_url, cancel_url=cancel_url, locale="es",
    ))
  return {"url": s.url, "session_id": s.id, "monto": monto, "recurrente": bool(paq.get("es_recurrente"))}


def checkout_penalizacion(penalizacion_id: str, origen: str) -> dict:
  pen = _uno("penalizaciones_noshow", "id, cliente_id, monto, estatus", id=penalizacion_id)
  if not pen or pen.get("estatus") != "Pendiente":
    raise ValueError("Esta penalización ya no está pendiente")
  customer = get_or_create_customer(pen["cliente_id"])
  meta = _meta({"tipo": "penalizacion", "penalizacion_id": pen["id"], "cliente_id": pen["cliente_id"], "origen": origen})
  ok_url, cancel_url = _urls(origen)
  s = _sesion_pago(dict(
    mode="payment", customer=customer, client_reference_id=pen["cliente_id"],
    line_items=[{"price_data": {"currency": "mxn", "unit_amount": centavos(pen["monto"]),
                                "product_data": {"name": "Penalización No Show"}}, "quantity": 1}],
    metadata=meta, payment_intent_data={"metadata": meta, "description": "Penalización No Show — Navy Training Center"},
    success_url=ok_url, cancel_url=cancel_url, locale="es",
  ), msi=False)
  return {"url": s.url, "session_id": s.id, "monto": pen["monto"]}


def checkout_agregar_tarjeta(cliente_id: str, origen: str) -> dict:
  customer = get_or_create_customer(cliente_id)
  ok_url, cancel_url = _urls(origen)
  s = stripe.checkout.Session.create(
    mode="setup", customer=customer, client_reference_id=cliente_id,
    payment_method_types=["card"],
    metadata=_meta({"tipo": "setup", "cliente_id": cliente_id, "origen": origen}),
    success_url=ok_url, cancel_url=cancel_url, locale="es",
  )
  return {"url": s.url, "session_id": s.id}


# ─── Cobros directos a la tarjeta guardada ───────────────────────────────────
def cobrar_tarjeta_guardada(cliente_id: str, monto: float, concepto: str, metadata: dict) -> dict:
  cus = _customer_existente(cliente_id)
  pm  = tarjeta_principal(cus) if cus else None
  if not pm:
    return {"ok": False, "error": "sin_tarjeta", "mensaje": "El cliente no tiene tarjeta guardada"}
  try:
    pi = stripe.PaymentIntent.create(
      amount=centavos(monto), currency="mxn", customer=cus.id, payment_method=pm,
      off_session=True, confirm=True, description=concepto,
      metadata=_meta(metadata), expand=["latest_charge"],
    )
  except stripe.error.CardError as e:
    pi_id = e.error.payment_intent.id if (e.error and e.error.payment_intent) else None
    return {"ok": False, "error": "rechazada", "mensaje": e.user_message or "La tarjeta fue rechazada",
            "payment_intent_id": pi_id}
  ch = pi.latest_charge
  return {
    "ok":                pi.status == "succeeded",
    "estado":            pi.status,
    "payment_intent_id": pi.id,
    "receipt_url":       ch.receipt_url if ch else None,
    "metodo":            etiqueta_metodo(ch),
    "comision":          comision_de(ch),
    "mensaje":           None if pi.status == "succeeded" else "El banco pidió autorización; el cliente debe pagar desde la app",
  }


async def cobrar_penalizacion_automatica(penalizacion_id: str) -> dict:
  pen = _uno("penalizaciones_noshow", "id, cliente_id, monto, estatus, clase_id, intentos_cobro", id=penalizacion_id)
  if not pen or pen.get("estatus") != "Pendiente":
    return {"ok": False, "error": "no_pendiente"}
  res = cobrar_tarjeta_guardada(
    pen["cliente_id"], pen["monto"], "Penalización No Show — Navy Training Center",
    {"tipo": "penalizacion", "penalizacion_id": pen["id"], "cliente_id": pen["cliente_id"]},
  )
  supabase.table("penalizaciones_noshow").update({"intentos_cobro": (pen.get("intentos_cobro") or 0) + 1})\
    .eq("id", pen["id"]).execute()
  if res.get("ok"):
    await marcar_penalizacion_pagada(pen, res.get("payment_intent_id"), res.get("receipt_url"), res.get("metodo"),
                                     comision=res.get("comision"))
  return res


# ─── Formulario nativo de la app (PaymentSheet) ──────────────────────────────
def _ephemeral_key(customer: str) -> str:
  return stripe.EphemeralKey.create(customer=customer, stripe_version=stripe.api_version).secret


def _producto(paq: dict) -> str:
  """Un producto de Stripe por paquete, con id fijo para reutilizarlo."""
  pid = f"navy_paq_{paq['id'].replace('-', '')}"
  try:
    stripe.Product.retrieve(pid)
  except stripe.error.InvalidRequestError:
    stripe.Product.create(id=pid, name=paq["nombre"], metadata={"paquete_id": paq["id"]})
  return pid


def _trial_end(memb) -> int | None:
  if not memb or not memb.get("fecha_fin"):
    return None
  arranque = datetime.combine(date.fromisoformat(memb["fecha_fin"]), datetime.min.time(), tzinfo=CDMX)
  if arranque - datetime.now(timezone.utc) > timedelta(hours=2):
    return int(arranque.timestamp())
  return None


def _preparar_compra(cliente_id: str, paquete_id: str, sucursal_id: str | None, origen: str) -> dict:
  paq = _uno("paquetes", "id, nombre, precio, vigencia_dias, es_recurrente, estatus", id=paquete_id)
  if not paq or (paq.get("estatus") and paq["estatus"] != "Activo"):
    raise ValueError("Este paquete no está disponible")
  cli = _uno("clientes", "id, sucursal_id", id=cliente_id)
  if not cli:
    raise ValueError("Cliente no encontrado")
  suc   = sucursal_id or cli.get("sucursal_id")
  monto = precio_paquete(paq, suc)
  memb  = membresia_activa(cliente_id)
  if paq.get("es_recurrente") and memb and memb.get("paquete_id") == paquete_id and memb.get("precio_pagado"):
    monto = float(memb["precio_pagado"])
  if monto <= 0:
    raise ValueError("El paquete no tiene precio en esta sucursal")
  customer = get_or_create_customer(cliente_id)
  meta = {"tipo": "paquete", "cliente_id": cliente_id, "paquete_id": paquete_id,
          "sucursal_id": suc, "origen": origen, "monto": monto}
  return {"paq": paq, "monto": monto, "memb": memb, "customer": customer, "meta": meta}


def crear_suscripcion(customer: str, paq: dict, monto: float, meta: dict, **extra):
  return stripe.Subscription.create(
    customer=customer,
    items=[{"price_data": {"currency": "mxn", "product": _producto(paq), "unit_amount": centavos(monto),
                           "recurring": intervalo(paq.get("vigencia_dias") or 30)}}],
    metadata=_meta(meta), description=f"{paq['nombre']} — Navy Training Center", **extra,
  )


def hoja_paquete(cliente_id: str, paquete_id: str, sucursal_id: str | None, origen: str) -> dict:
  c = _preparar_compra(cliente_id, paquete_id, sucursal_id, origen)
  paq, monto, customer, meta = c["paq"], c["monto"], c["customer"], c["meta"]
  base = {"customer": customer, "ephemeral_key": _ephemeral_key(customer), "monto": monto,
          "recurrente": bool(paq.get("es_recurrente"))}

  if not paq.get("es_recurrente"):
    pi = stripe.PaymentIntent.create(
      amount=centavos(monto), currency="mxn", customer=customer,
      automatic_payment_methods={"enabled": True},
      payment_method_options={"card": {"setup_future_usage": "off_session"}},
      metadata=_meta({**meta, "flujo": "sheet"}),
      description=f"{paq['nombre']} — Navy Training Center",
    )
    return {**base, "payment_intent": pi.client_secret, "intent_id": pi.id}

  # Recurrente: no duplicar una suscripción viva del mismo paquete
  for sub in stripe.Subscription.list(customer=customer, status="all", limit=20).data:
    if sub.status in ("active", "trialing", "past_due") and (sub.metadata or {}).get("paquete_id") == paquete_id:
      raise ValueError("Ya tienes este plan con renovación automática")

  trial = _trial_end(c["memb"])
  if trial:
    # Ya tiene plan activo: solo se guarda la tarjeta hoy; la suscripción se crea al confirmarla
    si = stripe.SetupIntent.create(
      customer=customer, usage="off_session", payment_method_types=["card"],
      metadata=_meta({**meta, "tipo": "suscripcion_programada", "trial_end": trial}),
    )
    inicio = datetime.fromtimestamp(trial, CDMX).date().isoformat()
    return {**base, "setup_intent": si.client_secret, "intent_id": si.id, "programada": True, "inicio": inicio}

  sub = crear_suscripcion(customer, paq, monto, meta,
    payment_behavior="default_incomplete",
    payment_settings={"save_default_payment_method": "on_subscription", "payment_method_types": ["card"]},
    expand=["latest_invoice.payment_intent"])
  pi = sub.latest_invoice.payment_intent
  return {**base, "payment_intent": pi.client_secret, "intent_id": pi.id}


def hoja_penalizacion(penalizacion_id: str) -> dict:
  pen = _uno("penalizaciones_noshow", "id, cliente_id, monto, estatus", id=penalizacion_id)
  if not pen or pen.get("estatus") != "Pendiente":
    raise ValueError("Esta penalización ya no está pendiente")
  customer = get_or_create_customer(pen["cliente_id"])
  pi = stripe.PaymentIntent.create(
    amount=centavos(pen["monto"]), currency="mxn", customer=customer,
    automatic_payment_methods={"enabled": True},
    payment_method_options={"card": {"setup_future_usage": "off_session"}},
    metadata=_meta({"tipo": "penalizacion", "penalizacion_id": pen["id"], "cliente_id": pen["cliente_id"], "flujo": "sheet"}),
    description="Penalización No Show — Navy Training Center",
  )
  return {"customer": customer, "ephemeral_key": _ephemeral_key(customer),
          "payment_intent": pi.client_secret, "intent_id": pi.id, "monto": pen["monto"]}


def hoja_tarjeta(cliente_id: str) -> dict:
  customer = get_or_create_customer(cliente_id)
  si = stripe.SetupIntent.create(
    customer=customer, usage="off_session", payment_method_types=["card"],
    metadata=_meta({"tipo": "setup", "cliente_id": cliente_id}),
  )
  return {"customer": customer, "ephemeral_key": _ephemeral_key(customer),
          "setup_intent": si.client_secret, "intent_id": si.id}


# ─── Links de pago (nuevos clientes) ─────────────────────────────────────────
def _precio_stripe(paq: dict, monto: float, recurrente: bool) -> str:
  dias = paq.get("vigencia_dias") or 30
  key = f"navy_{paq['id'].replace('-', '')}_{centavos(monto)}_{'r' + str(dias) if recurrente else 'u'}"
  existente = stripe.Price.list(lookup_keys=[key], active=True, limit=1).data
  if existente:
    return existente[0].id
  kw = dict(product=_producto(paq), currency="mxn", unit_amount=centavos(monto), lookup_key=key)
  if recurrente:
    kw["recurring"] = intervalo(dias)
  return stripe.Price.create(**kw).id


def crear_link_pago(paquete_id: str, sucursal_id: str, staff_id: str | None) -> dict:
  paq = _uno("paquetes", "id, nombre, precio, vigencia_dias, es_recurrente, estatus", id=paquete_id)
  if not paq or (paq.get("estatus") and paq["estatus"] != "Activo"):
    raise ValueError("Este paquete no está disponible")
  monto = precio_paquete(paq, sucursal_id)
  if monto <= 0:
    raise ValueError("El paquete no tiene precio en esta sucursal")
  rec  = bool(paq.get("es_recurrente"))
  meta = _meta({"tipo": "link_nuevo", "paquete_id": paquete_id, "sucursal_id": sucursal_id,
                "staff_id": staff_id, "monto": monto})
  desc = f"{paq['nombre']} — Navy Training Center"
  kw = dict(
    line_items=[{"price": _precio_stripe(paq, monto, rec), "quantity": 1}],
    metadata=meta,
    after_completion={"type": "redirect", "redirect": {
      "url": f"{FRONTEND_URL}/pago/completado?session_id={{CHECKOUT_SESSION_ID}}&canal=link"}},
    phone_number_collection={"enabled": True},
    custom_fields=[{"key": "nombre", "type": "text",
                    "label": {"type": "custom", "custom": "Nombre completo"}}],
  )
  if rec:
    kw["subscription_data"] = {"metadata": meta, "description": desc}
  else:
    kw["payment_intent_data"] = {"metadata": meta, "description": desc}
    kw["customer_creation"] = "always"
  link = stripe.PaymentLink.create(**kw)

  fila = supabase.table("links_pago").insert({
    "stripe_payment_link_id": link.id,
    "url":                    link.url,
    "paquete_id":             paquete_id,
    "sucursal_id":            sucursal_id,
    "monto":                  monto,
    "recurrente":             rec,
    "creado_por":             staff_id,
  }).execute().data[0]
  return {**fila, "paquete": paq["nombre"]}


def desactivar_link(link_id: str):
  fila = _uno("links_pago", "id, stripe_payment_link_id", id=link_id)
  if not fila:
    raise ValueError("Link no encontrado")
  stripe.PaymentLink.modify(fila["stripe_payment_link_id"], active=False)
  supabase.table("links_pago").update({"activo": False}).eq("id", link_id).execute()