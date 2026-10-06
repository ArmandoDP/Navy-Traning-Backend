# routers/stripe_pagos.py  →  prefijo /stripe
import os
import stripe
from datetime import date, datetime, timedelta, timezone
from fastapi  import APIRouter, HTTPException, Request
from services.supabase   import supabase
from services.auth_app   import autorizar_cliente, staff_de_sesion
from services.email      import enviar_comprobante_compra
from services import stripe_service as ss
from services.stripe_activacion import (
  _uno, CDMX, activar_paquete, marcar_penalizacion_pagada, registrar_oxxo_pendiente,
  marcar_pago_fallido, push_cliente, correo_simple, membresia_activa,
)

router = APIRouter()


def _error(e: Exception):
  if isinstance(e, HTTPException):
    raise e
  if isinstance(e, ValueError):
    raise HTTPException(status_code=400, detail=str(e))
  if isinstance(e, stripe.error.StripeError):
    raise HTTPException(status_code=400, detail=e.user_message or "Error con Stripe")
  print("Error Stripe:", repr(e))
  raise HTTPException(status_code=500, detail="Error procesando el pago")


# ─── Checkouts (app y CRM) ───────────────────────────────────────────────────
@router.post("/checkout")
async def crear_checkout(request: Request):
  b = await request.json()
  autorizar_cliente(request, b.get("cliente_id"))
  try:
    return ss.checkout_paquete(b["cliente_id"], b["paquete_id"], b.get("sucursal_id"), b.get("origen", "app"))
  except Exception as e:
    _error(e)


@router.post("/penalizacion/checkout")
async def checkout_penalizacion(request: Request):
  b = await request.json()
  pen = _uno("penalizaciones_noshow", "cliente_id", id=b.get("penalizacion_id"))
  if not pen:
    raise HTTPException(status_code=404, detail="Penalización no encontrada")
  autorizar_cliente(request, pen["cliente_id"])
  try:
    return ss.checkout_penalizacion(b["penalizacion_id"], b.get("origen", "app"))
  except Exception as e:
    _error(e)


@router.post("/penalizacion/cobrar")
async def cobrar_penalizacion(request: Request):
  """Pagar la penalización con la tarjeta guardada, en un toque."""
  b = await request.json()
  pen = _uno("penalizaciones_noshow", "cliente_id", id=b.get("penalizacion_id"))
  if not pen:
    raise HTTPException(status_code=404, detail="Penalización no encontrada")
  autorizar_cliente(request, pen["cliente_id"])
  res = await ss.cobrar_penalizacion_automatica(b["penalizacion_id"])
  if not res.get("ok"):
    raise HTTPException(status_code=402, detail=res.get("mensaje") or "No se pudo cobrar")
  return {"ok": True, "metodo": res.get("metodo")}


@router.post("/setup")
async def agregar_tarjeta(request: Request):
  b = await request.json()
  autorizar_cliente(request, b.get("cliente_id"))
  try:
    return ss.checkout_agregar_tarjeta(b["cliente_id"], b.get("origen", "app"))
  except Exception as e:
    _error(e)


# ─── Formulario nativo de la app ─────────────────────────────────────────────
@router.post("/hoja/paquete")
async def hoja_paquete(request: Request):
  b = await request.json()
  autorizar_cliente(request, b.get("cliente_id"))
  try:
    return ss.hoja_paquete(b["cliente_id"], b["paquete_id"], b.get("sucursal_id"), b.get("origen", "app"))
  except Exception as e:
    _error(e)


@router.post("/hoja/penalizacion")
async def hoja_penalizacion(request: Request):
  b = await request.json()
  pen = _uno("penalizaciones_noshow", "cliente_id", id=b.get("penalizacion_id"))
  if not pen:
    raise HTTPException(status_code=404, detail="Penalización no encontrada")
  autorizar_cliente(request, pen["cliente_id"])
  try:
    return ss.hoja_penalizacion(b["penalizacion_id"])
  except Exception as e:
    _error(e)


@router.post("/hoja/tarjeta")
async def hoja_tarjeta(request: Request):
  b = await request.json()
  autorizar_cliente(request, b.get("cliente_id"))
  try:
    return ss.hoja_tarjeta(b["cliente_id"])
  except Exception as e:
    _error(e)


@router.get("/pi/{intent_id}")
async def estado_pago(intent_id: str):
  """La app lo consulta después del formulario nativo."""
  try:
    pi = stripe.PaymentIntent.retrieve(intent_id)
  except stripe.error.InvalidRequestError:
    raise HTTPException(status_code=404, detail="Pago no encontrado")
  meta  = dict(pi.metadata or {})
  monto = (pi.amount or 0) / 100

  if pi.status == "succeeded":
    if pi.invoice:
      activado = bool(_uno("pagos", "id", stripe_invoice_id=pi.invoice))
    elif meta.get("tipo") == "penalizacion":
      activado = (_uno("penalizaciones_noshow", "estatus", id=meta.get("penalizacion_id")) or {}).get("estatus") == "Pagado"
    else:
      activado = bool(_uno("pagos", "id", stripe_payment_intent_id=pi.id, estatus="Completado"))
    return {"estado": "pagado", "activado": activado, "monto": monto}

  oxxo = ((pi.get("next_action") or {}).get("oxxo_display_details") or {})
  if oxxo.get("hosted_voucher_url"):
    if meta.get("cliente_id"):
      await registrar_oxxo_pendiente(
        payment_intent_id=pi.id, cliente_id=meta["cliente_id"], monto=monto,
        concepto="Penalización No Show" if meta.get("tipo") == "penalizacion" else "Compra de paquete (OXXO)",
        sucursal_id=meta.get("sucursal_id"), voucher_url=oxxo["hosted_voucher_url"], metadata=meta)
    return {"estado": "pendiente_oxxo", "voucher_url": oxxo["hosted_voucher_url"], "monto": monto}

  if pi.status == "processing":
    return {"estado": "pagado", "activado": False, "monto": monto}
  if pi.status in ("requires_payment_method", "canceled"):
    return {"estado": "fallido", "monto": monto}
  return {"estado": "abierta", "monto": monto}


# ─── Tarjetas guardadas ──────────────────────────────────────────────────────
@router.get("/metodos/{cliente_id}")
async def metodos(cliente_id: str, request: Request):
  autorizar_cliente(request, cliente_id)
  try:
    return {"metodos": ss.listar_tarjetas(cliente_id)}
  except Exception as e:
    _error(e)


@router.post("/metodos/principal")
async def metodo_principal(request: Request):
  b = await request.json()
  autorizar_cliente(request, b.get("cliente_id"))
  try:
    ss.hacer_principal(b["cliente_id"], b["payment_method_id"])
    return {"ok": True}
  except Exception as e:
    _error(e)


@router.delete("/metodos/{cliente_id}/{payment_method_id}")
async def eliminar_metodo(cliente_id: str, payment_method_id: str, request: Request):
  autorizar_cliente(request, cliente_id)
  try:
    ss.eliminar_tarjeta(cliente_id, payment_method_id)
    return {"ok": True}
  except Exception as e:
    _error(e)


# ─── Cobro a tarjeta guardada desde el CRM (The Galley y otros) ──────────────
@router.post("/cobrar-tarjeta")
async def cobrar_tarjeta(request: Request):
  staff = staff_de_sesion(request)
  b = await request.json()
  cliente_id = b.get("cliente_id")
  monto      = float(b.get("monto") or 0)
  concepto   = b.get("concepto") or "Compra The Galley"
  if not cliente_id or monto <= 0:
    raise HTTPException(status_code=400, detail="cliente_id y monto son requeridos")

  cli = _uno("clientes", "id, nombre_completo, email, sucursal_id", id=cliente_id)
  if not cli:
    raise HTTPException(status_code=404, detail="Cliente no encontrado")
  sucursal_id = b.get("sucursal_id") or cli.get("sucursal_id")

  res = ss.cobrar_tarjeta_guardada(cliente_id, monto, concepto,
    {"tipo": "cargo_directo", "cliente_id": cliente_id, "staff_id": staff.get("id"),
     "venta_id": b.get("venta_id"), "concepto": concepto})

  supabase.table("pagos").insert({
    "cliente_id":               cliente_id,
    "sucursal_id":              sucursal_id,
    "monto":                    monto,
    "estatus":                  "Completado" if res.get("ok") else "Fallido",
    "metodo_pago":              res.get("metodo") or "Tarjeta guardada",
    "canal":                    "Stripe",
    "concepto":                 concepto,
    "fecha_pago":               datetime.now(timezone.utc).isoformat(),
    "stripe_payment_intent_id": res.get("payment_intent_id"),
    "receipt_url":              res.get("receipt_url"),
    "metadata":                 {"venta_id": b.get("venta_id"), "staff_id": staff.get("id")},
  }).execute()

  quien = " ".join(f"{staff.get('nombre') or ''} {staff.get('primer_apellido') or ''}".split())
  supabase.table("actividad_log").insert({
    "tipo":        "cargo_tarjeta" if res.get("ok") else "cargo_tarjeta_fallido",
    "descripcion": f"{quien} {'cobró' if res.get('ok') else 'intentó cobrar'} ${monto:,.2f} a {cli['nombre_completo']} ({concepto})",
    "tabla":       "pagos",
    "accion":      "INSERT",
    "metadata":    {"cliente_id": cliente_id, "monto": monto, "concepto": concepto,
                    "metodo": res.get("metodo"), "error": res.get("mensaje")},
    "sucursal_id": sucursal_id,
    "staff_id":    staff.get("id"),
  }).execute()

  if not res.get("ok"):
    raise HTTPException(status_code=402, detail=res.get("mensaje") or "No se pudo cobrar")

  try:
    await enviar_comprobante_compra(
      email=cli.get("email"), nombre=cli.get("nombre_completo"), monto=monto,
      metodo_pago=res.get("metodo"), folio=(res.get("payment_intent_id") or "")[-12:].upper(), concepto=concepto,
    )
  except Exception as e:
    print("Error comprobante cargo directo:", e)
  await push_cliente(cliente_id, "🧾 Compra registrada",
    f"Se cobraron ${monto:,.2f} a tu {res.get('metodo')} por {concepto}. Te enviamos tu comprobante.",
    {"tipo": "cargo_tarjeta"})
  return {"ok": True, "metodo": res.get("metodo"), "receipt_url": res.get("receipt_url")}


# ─── Estado de un checkout (la app lo consulta al volver del pago) ──────────
@router.get("/sesion/{session_id}")
async def estado_sesion(session_id: str):
  try:
    s = stripe.checkout.Session.retrieve(session_id, expand=["payment_intent"])
  except stripe.error.InvalidRequestError:
    raise HTTPException(status_code=404, detail="Sesión no encontrada")
  monto = (s.amount_total or 0) / 100

  if s.status == "expired":
    return {"estado": "cancelado", "monto": monto}

  if s.mode == "setup":
    return {"estado": "tarjeta_agregada" if s.status == "complete" else "abierta", "activado": s.status == "complete"}

  if s.mode == "subscription":
    if s.status != "complete":
      return {"estado": "abierta", "monto": monto}
    sub = stripe.Subscription.retrieve(s.subscription)
    if sub.status == "trialing":
      inicio = datetime.fromtimestamp(sub.trial_end, CDMX).date().isoformat()
      return {"estado": "programada", "activado": True, "inicio": inicio, "monto": monto}
    activado = bool(sub.latest_invoice and _uno("pagos", "id", stripe_invoice_id=sub.latest_invoice))
    return {"estado": "pagado", "activado": activado, "monto": monto}

  if s.payment_status == "paid":
    p = _uno("pagos", "estatus", stripe_checkout_session_id=s.id)
    pen_ok = (s.metadata or {}).get("tipo") == "penalizacion" and \
      (_uno("penalizaciones_noshow", "estatus", id=(s.metadata or {}).get("penalizacion_id")) or {}).get("estatus") == "Pagado"
    return {"estado": "pagado", "activado": bool(p and p.get("estatus") == "Completado") or pen_ok, "monto": monto}

  pi = s.payment_intent
  oxxo = ((pi.get("next_action") or {}).get("oxxo_display_details") or {}) if pi else {}
  if oxxo.get("hosted_voucher_url"):
    return {"estado": "pendiente_oxxo", "voucher_url": oxxo["hosted_voucher_url"],
            "expira": oxxo.get("expires_after"), "monto": monto}

  return {"estado": "abierta" if s.status == "open" else "fallido", "monto": monto}


# ─── Webhook: la única fuente de verdad ──────────────────────────────────────
@router.post("/webhook")
async def webhook(request: Request):
  payload = await request.body()
  try:
    event = stripe.Webhook.construct_event(
      payload, request.headers.get("stripe-signature"), os.getenv("STRIPE_WEBHOOK_SECRET"))
  except Exception as e:
    raise HTTPException(status_code=400, detail=f"Firma inválida: {e}")

  try:
    supabase.table("stripe_eventos").insert({"id": event["id"], "tipo": event["type"]}).execute()
  except Exception:
    return {"ok": True, "duplicado": True}

  try:
    await _procesar(event)
  except Exception as e:
    print(f"❌ Error procesando {event['type']} {event['id']}: {repr(e)}")
    supabase.table("stripe_eventos").delete().eq("id", event["id"]).execute()  # Stripe lo reintenta
    raise HTTPException(status_code=500, detail="Error procesando evento")
  return {"ok": True}


async def _procesar(event):
  tipo = event["type"]
  obj  = event["data"]["object"]
  print(f"🔔 Stripe {tipo} {obj.get('id')}")

  if tipo.startswith("checkout.session."):
    s = stripe.checkout.Session.retrieve(obj["id"], expand=["payment_intent.latest_charge"])
    meta = dict(s.metadata or {})

    if s.mode == "setup":
      if tipo == "checkout.session.completed":
        await _tarjeta_agregada(s, meta)
      return

    if s.mode == "subscription":
      if tipo == "checkout.session.completed":
        await _suscripcion_creada(s, meta)
      return

    if tipo == "checkout.session.expired":
      marcar_pago_fallido(s.id, "Expirado")
      return
    if tipo == "checkout.session.async_payment_failed":
      marcar_pago_fallido(s.id)
      if meta.get("cliente_id"):
        await push_cliente(meta["cliente_id"], "Tu ficha OXXO venció",
          "No se registró el pago a tiempo. Puedes generar una nueva desde la app.", {"tipo": "oxxo_vencido"})
      return

    if s.payment_status == "paid":
      await _pago_unico(s, meta)
    elif tipo == "checkout.session.completed":
      pi = s.payment_intent
      oxxo = ((pi.get("next_action") or {}).get("oxxo_display_details") or {}) if pi else {}
      await registrar_oxxo_pendiente(
        session_id=s.id, cliente_id=meta.get("cliente_id"), monto=(s.amount_total or 0) / 100,
        concepto="Penalización No Show" if meta.get("tipo") == "penalizacion" else "Compra de paquete (OXXO)",
        sucursal_id=meta.get("sucursal_id"), voucher_url=oxxo.get("hosted_voucher_url"), metadata=meta)
    return

  if tipo == "payment_intent.succeeded":
    await _pi_exitoso(stripe.PaymentIntent.retrieve(obj["id"], expand=["latest_charge"]))
    return
  if tipo == "payment_intent.payment_failed":
    pi_meta = dict(obj.get("metadata") or {})
    if pi_meta.get("flujo") == "sheet":
      supabase.table("pagos").update({"estatus": "Fallido"})\
        .eq("stripe_payment_intent_id", obj["id"]).eq("estatus", "Pendiente").execute()
    return
  if tipo == "setup_intent.succeeded":
    await _setup_exitoso(stripe.SetupIntent.retrieve(obj["id"]))
    return

  if tipo == "invoice.paid":
    await _factura_pagada(stripe.Invoice.retrieve(obj["id"], expand=["subscription", "charge"]))
  elif tipo == "invoice.payment_failed":
    await _factura_fallida(stripe.Invoice.retrieve(obj["id"], expand=["subscription"]))
  elif tipo == "customer.subscription.deleted":
    _suscripcion_cancelada(obj["id"])
  elif tipo == "charge.refunded":
    _reembolso(obj)


async def _pago_unico(s, meta):
  pi = s.payment_intent
  ch = pi.latest_charge if pi else None
  metodo = ss.etiqueta_metodo(ch)
  if meta.get("tipo") == "penalizacion":
    pen = _uno("penalizaciones_noshow", "id, cliente_id, monto, clase_id, estatus", id=meta.get("penalizacion_id"))
    if pen and pen.get("estatus") != "Pagado":
      await marcar_penalizacion_pagada(pen, pi.id if pi else None, ch.receipt_url if ch else None, metodo, session_id=s.id)
      await push_cliente(pen["cliente_id"], "✅ Pago recibido",
        "Tu penalización quedó liquidada. Ya puedes seguir reservando.", {"tipo": "penalizacion_pagada"})
    return
  await activar_paquete(
    cliente_id=meta["cliente_id"], paquete_id=meta["paquete_id"], monto=(s.amount_total or 0) / 100,
    sucursal_id=meta.get("sucursal_id"), metodo=metodo, origen=meta.get("origen", "app"),
    session_id=s.id, payment_intent_id=pi.id if pi else None, receipt_url=ch.receipt_url if ch else None,
  )


async def _tarjeta_agregada(s, meta):
  si = stripe.SetupIntent.retrieve(s.setup_intent)
  if si.payment_method:
    stripe.Customer.modify(s.customer, invoice_settings={"default_payment_method": si.payment_method})
  if meta.get("cliente_id"):
    await push_cliente(meta["cliente_id"], "💳 Tarjeta agregada",
      "Quedó como tu tarjeta principal para renovaciones y compras.", {"tipo": "tarjeta_agregada"})


async def _suscripcion_creada(s, meta):
  sub = stripe.Subscription.retrieve(s.subscription)
  cliente_id = meta.get("cliente_id")
  if not cliente_id:
    return
  supabase.table("clientes").update({"stripe_subscription_id": sub.id}).eq("id", cliente_id).execute()
  if sub.status == "trialing":
    # Ya tenía plan activo: la suscripción cubre la siguiente renovación
    memb = membresia_activa(cliente_id)
    if memb:
      supabase.table("membresias").update({"stripe_subscription_id": sub.id, "renovacion_cancelada": False})\
        .eq("id", memb["id"]).execute()
    inicio = datetime.fromtimestamp(sub.trial_end, CDMX).strftime("%d/%m/%Y")
    await push_cliente(cliente_id, "🔄 ¡Listo! Renovación activada",
      f"Tu plan se renovará automáticamente el {inicio}. No se te cobra nada hoy.", {"tipo": "renovacion_activada"})


async def _factura_pagada(inv):
  sub = inv.subscription
  if not sub or (inv.amount_paid or 0) <= 0:
    return  # factura de $0 (periodo programado)
  meta = dict(sub.metadata or {})
  if not meta.get("cliente_id") or not meta.get("paquete_id"):
    print("Factura sin metadata de Navy:", inv.id)
    return
  periodo_fin = inv.lines.data[0].period.end if inv.lines and inv.lines.data else None
  await activar_paquete(
    cliente_id=meta["cliente_id"], paquete_id=meta["paquete_id"], monto=inv.amount_paid / 100,
    sucursal_id=meta.get("sucursal_id"), metodo=ss.etiqueta_metodo(inv.charge),
    origen=meta.get("origen", "app"), invoice_id=inv.id, subscription_id=sub.id,
    payment_intent_id=inv.payment_intent if isinstance(inv.payment_intent, str) else None,
    receipt_url=inv.hosted_invoice_url,
    fecha_fin_stripe=datetime.fromtimestamp(periodo_fin, CDMX).date() if periodo_fin else None,
    es_renovacion=inv.billing_reason == "subscription_cycle",
  )


async def _factura_fallida(inv):
  sub = inv.subscription
  meta = dict(sub.metadata or {}) if sub else {}
  cliente_id = meta.get("cliente_id")
  if not cliente_id:
    return
  cli = _uno("clientes", "nombre_completo, email", id=cliente_id) or {}
  nombre = (cli.get("nombre_completo") or "").split()[0] if cli.get("nombre_completo") else ""

  # Días de gracia: al primer intento fallido se dan 3 días más de acceso
  if (inv.attempt_count or 0) == 1:
    memb = membresia_activa(cliente_id)
    if memb:
      nueva = (date.fromisoformat(memb["fecha_fin"]) + timedelta(days=3)).isoformat()
      supabase.table("membresias").update({"fecha_fin": nueva}).eq("id", memb["id"]).execute()
      supabase.table("clientes").update({"fecha_venc_plan": nueva}).eq("id", cliente_id).execute()

  supabase.table("alertas").insert({
    "tipo":        "pago_fallido",
    "categoria":   "operacion",
    "titulo":      f"Renovación fallida — {cli.get('nombre_completo', '')}",
    "descripcion": f"Intento {inv.attempt_count} de cobro de la factura {inv.id}",
    "cliente_id":  cliente_id,
    "metadata":    {"invoice_id": inv.id, "subscription_id": sub.id if sub else None},
  }).execute()

  await push_cliente(cliente_id, "⚠️ No pudimos cobrar tu renovación",
    "Actualiza tu tarjeta en la app para no perder tu plan. Tienes 3 días.", {"tipo": "renovacion_fallida"})
  await correo_simple(cli.get("email"), nombre, "No pudimos cobrar tu renovación",
    "Intentamos renovar tu plan pero tu banco rechazó el cobro. Entra a la app, en <b>Perfil → Métodos de pago</b>, "
    "y actualiza tu tarjeta. Mantienes tu acceso 3 días mientras lo resuelves.")


def _suscripcion_cancelada(sub_id: str):
  supabase.table("membresias").update({"renovacion_cancelada": True})\
    .eq("stripe_subscription_id", sub_id).eq("estatus", "Activa").execute()
  supabase.table("clientes").update({"stripe_subscription_id": None}).eq("stripe_subscription_id", sub_id).execute()


def _reembolso(charge):
  pi_id = charge.get("payment_intent")
  if not pi_id:
    return
  total = charge.get("amount_refunded", 0) >= charge.get("amount", 0)
  supabase.table("pagos").update({"estatus": "Reembolsado" if total else "Reembolso parcial"})\
    .eq("stripe_payment_intent_id", pi_id).execute()


async def _pi_exitoso(pi):
  """Pagos del formulario nativo. Los de Checkout, facturas y cargos directos se procesan en otro lado."""
  meta = dict(pi.metadata or {})
  if meta.get("flujo") != "sheet" or pi.invoice:
    return
  ch = pi.latest_charge
  metodo = ss.etiqueta_metodo(ch)
  if meta.get("tipo") == "penalizacion":
    pen = _uno("penalizaciones_noshow", "id, cliente_id, monto, clase_id, estatus", id=meta.get("penalizacion_id"))
    if pen and pen.get("estatus") != "Pagado":
      await marcar_penalizacion_pagada(pen, pi.id, ch.receipt_url if ch else None, metodo)
      await push_cliente(pen["cliente_id"], "✅ Pago recibido",
        "Tu penalización quedó liquidada. Ya puedes seguir reservando.", {"tipo": "penalizacion_pagada"})
    return
  if meta.get("tipo") == "paquete":
    await activar_paquete(
      cliente_id=meta["cliente_id"], paquete_id=meta["paquete_id"], monto=(pi.amount or 0) / 100,
      sucursal_id=meta.get("sucursal_id"), metodo=metodo, origen=meta.get("origen", "app"),
      payment_intent_id=pi.id, receipt_url=ch.receipt_url if ch else None,
    )


async def _setup_exitoso(si):
  meta = dict(si.metadata or {})
  cliente_id = meta.get("cliente_id")
  if not cliente_id or not si.payment_method:
    return
  stripe.Customer.modify(si.customer, invoice_settings={"default_payment_method": si.payment_method})

  if meta.get("tipo") == "setup":
    await push_cliente(cliente_id, "💳 Tarjeta agregada",
      "Quedó como tu tarjeta principal para renovaciones y compras.", {"tipo": "tarjeta_agregada"})
    return

  if meta.get("tipo") == "suscripcion_programada":
    paq = _uno("paquetes", "id, nombre, vigencia_dias", id=meta.get("paquete_id"))
    if not paq:
      return
    sub = ss.crear_suscripcion(
      si.customer, paq, float(meta.get("monto") or 0),
      {**{k: v for k, v in meta.items() if k not in ("tipo", "trial_end")}, "tipo": "paquete"},
      trial_end=int(meta["trial_end"]), default_payment_method=si.payment_method,
    )
    supabase.table("clientes").update({"stripe_subscription_id": sub.id}).eq("id", cliente_id).execute()
    memb = membresia_activa(cliente_id)
    if memb:
      supabase.table("membresias").update({"stripe_subscription_id": sub.id, "renovacion_cancelada": False})\
        .eq("id", memb["id"]).execute()
    inicio = datetime.fromtimestamp(int(meta["trial_end"]), CDMX).strftime("%d/%m/%Y")
    await push_cliente(cliente_id, "🔄 ¡Listo! Renovación activada",
      f"Tu plan se renovará automáticamente el {inicio}. No se te cobra nada hoy.", {"tipo": "renovacion_activada"})