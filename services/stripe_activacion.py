# services/stripe_activacion.py
# Qué pasa en Navy cuando Stripe confirma un cobro: pago, membresía, correo y push.
# Todo es idempotente: si el mismo cobro llega dos veces, no se duplica nada.
import os
import httpx
from datetime import date, datetime, timedelta, timezone
from services.supabase import supabase
from services.push     import enviar_push

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://crm.navytrainingcenter.com")
CDMX         = timezone(timedelta(hours=-6))


def hoy_cdmx() -> date:
  return datetime.now(CDMX).date()


def _uno(tabla: str, select: str, **filtros):
  q = supabase.table(tabla).select(select)
  for k, v in filtros.items():
    q = q.eq(k, v)
  r = q.limit(1).execute()
  return r.data[0] if r.data else None


def nombre_sucursal(sucursal_id: str | None) -> str:
  if not sucursal_id:
    return "Navy Training Center"
  s = _uno("sucursales", "nombre", id=sucursal_id)
  return s["nombre"] if s else "Navy Training Center"


async def push_cliente(cliente_id: str, titulo: str, cuerpo: str, data: dict | None = None):
  r = supabase.table("push_tokens").select("token").eq("cliente_id", cliente_id).execute()
  tokens = [t["token"] for t in (r.data or []) if t.get("token")]
  if not tokens:
    return
  try:
    await enviar_push(tokens, titulo=titulo, cuerpo=cuerpo, data=data or {})
  except Exception as e:
    print("Error push:", e)


async def correo_simple(email: str | None, nombre: str, asunto: str, mensaje_html: str):
  if not email:
    return
  try:
    async with httpx.AsyncClient(timeout=15.0) as client:
      await client.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {os.getenv('RESEND_API_KEY')}", "Content-Type": "application/json"},
        json={
          "from":    "Navy Training Center <noreply@navytrainingcenter.com>",
          "to":      email,
          "subject": asunto,
          "html": f"""<div style="font-family:Arial,sans-serif;max-width:560px;margin:32px auto">
            <div style="background:#171B24;border-radius:20px 20px 0 0;padding:28px;text-align:center">
              <img src="https://crm.navytrainingcenter.com/email/logo-navy.png" alt="NAVY" width="140"
                   style="display:block;margin:0 auto;filter:brightness(0) invert(1)">
            </div>
            <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-radius:0 0 20px 20px">
              <h2 style="color:#111;margin:0 0 12px">Hola {nombre} 👋</h2>
              <p style="color:#4b5563;font-size:15px;line-height:24px;margin:0">{mensaje_html}</p>
            </div></div>""",
        },
      )
  except Exception as e:
    print("Error correo:", e)


async def comprobante_paquete(cliente: dict, paquete: dict, fecha_inicio: str, fecha_fin: str,
                              monto: float, folio: str, metodo: str, sucursal: str, tenia_plan: bool):
  """Usa el correo comprobante premium que ya existe en el CRM."""
  try:
    async with httpx.AsyncClient(timeout=15.0) as client:
      await client.post(f"{FRONTEND_URL}/api/correo/comprobante-pago", json={
        "email":                   cliente.get("email"),
        "nombre":                  cliente.get("nombre_completo"),
        "paquete_nombre":          paquete.get("nombre"),
        "vigencia_dias":           paquete.get("vigencia_dias", 30),
        "clases_incluidas":        paquete.get("clases_incluidas"),
        "acceso_total":            paquete.get("acceso_total", False),
        "acceso_sucursal_hermana": paquete.get("acceso_sucursal_hermana", False),
        "es_recurrente":           paquete.get("es_recurrente", False),
        "descripcion":             paquete.get("descripcion"),
        "fecha_inicio":            fecha_inicio,
        "fecha_fin":               fecha_fin,
        "monto":                   monto,
        "metodo_pago":             metodo,
        "referencia":              folio,
        "sucursal_nombre":         sucursal,
        "tiene_membresia_previa":  tenia_plan,
        "folio":                   folio,
      })
  except Exception as e:
    print("Error comprobante:", e)


def membresia_activa(cliente_id: str):
  r = supabase.table("membresias")\
    .select("id, paquete_id, fecha_fin, precio_pagado, stripe_subscription_id")\
    .eq("cliente_id", cliente_id).eq("estatus", "Activa")\
    .order("fecha_fin", desc=True).limit(1).execute()
  return r.data[0] if r.data else None


async def activar_paquete(*, cliente_id: str, paquete_id: str, monto: float, sucursal_id: str | None,
                          metodo: str, origen: str, session_id: str | None = None,
                          payment_intent_id: str | None = None, invoice_id: str | None = None,
                          subscription_id: str | None = None, receipt_url: str | None = None,
                          fecha_fin_stripe: date | None = None, es_renovacion: bool = False,
                          comision: float | None = None) -> dict:
  # Idempotencia
  if invoice_id and _uno("pagos", "id", stripe_invoice_id=invoice_id):
    return {"ok": True, "duplicado": True}
  pago_previo = None
  if session_id:
    pago_previo = _uno("pagos", "id, estatus", stripe_checkout_session_id=session_id)
  if not pago_previo and payment_intent_id:
    pago_previo = _uno("pagos", "id, estatus", stripe_payment_intent_id=payment_intent_id)
  if pago_previo and pago_previo.get("estatus") == "Completado":
    return {"ok": True, "duplicado": True}

  cliente = _uno("clientes", "id, nombre_completo, email, sucursal_id", id=cliente_id)
  paquete = _uno("paquetes",
    "id, nombre, vigencia_dias, clases_incluidas, acceso_total, acceso_sucursal_hermana, es_recurrente, descripcion",
    id=paquete_id)
  if not cliente or not paquete:
    raise ValueError(f"Cliente o paquete no encontrado ({cliente_id}, {paquete_id})")
  sucursal_id = sucursal_id or cliente.get("sucursal_id")

  # Paquetes en cola: si tiene un plan activo, el nuevo arranca cuando termine
  hoy   = hoy_cdmx()
  memb  = membresia_activa(cliente_id)
  tenia = bool(memb)
  inicio = max(hoy, date.fromisoformat(memb["fecha_fin"])) if memb else hoy
  vigencia = paquete.get("vigencia_dias") or 30
  fin = fecha_fin_stripe if (fecha_fin_stripe and fecha_fin_stripe > inicio) else inicio + timedelta(days=vigencia)

  concepto = f"{'Renovación automática' if es_renovacion else 'Compra'} — {paquete['nombre']}"
  pago = {
    "cliente_id":                 cliente_id,
    "sucursal_id":                sucursal_id,
    "monto":                      monto,
    "estatus":                    "Completado",
    "metodo_pago":                metodo,
    "canal":                      "Stripe",
    "concepto":                   concepto,
    "fecha_pago":                 datetime.now(CDMX).isoformat(),
    "stripe_checkout_session_id": session_id,
    "stripe_payment_intent_id":   payment_intent_id,
    "stripe_invoice_id":          invoice_id,
    "receipt_url":                receipt_url,
    "comision":                   comision,
    "metadata":                   {"origen": origen, "paquete_id": paquete_id, "subscription_id": subscription_id},
  }
  if pago_previo:  # OXXO que ya estaba pendiente
    supabase.table("pagos").update(pago).eq("id", pago_previo["id"]).execute()
  else:
    supabase.table("pagos").insert(pago).execute()

  supabase.table("membresias").insert({
    "cliente_id":             cliente_id,
    "paquete_id":             paquete_id,
    "fecha_inicio":           inicio.isoformat(),
    "fecha_fin":              fin.isoformat(),
    "estatus":                "Activa",
    "precio_pagado":          monto,
    "origen":                 "Renovacion" if es_renovacion else ("CRM" if origen == "crm" else "App"),
    "stripe_subscription_id": subscription_id,
  }).execute()

  upd = {"estatus": "Activo", "fecha_venc_plan": fin.isoformat()}
  if not tenia:
    upd.update({"plan": paquete["nombre"], "paquete_id": paquete_id})
  if subscription_id:
    upd["stripe_subscription_id"] = subscription_id
  supabase.table("clientes").update(upd).eq("id", cliente_id).execute()

  folio = (invoice_id or payment_intent_id or session_id or "")[-12:].upper()
  await comprobante_paquete(cliente, paquete, inicio.isoformat(), fin.isoformat(),
                            monto, folio, metodo, nombre_sucursal(sucursal_id), tenia)

  nombre1 = (cliente.get("nombre_completo") or "").split()[0] if cliente.get("nombre_completo") else ""
  if es_renovacion:
    await push_cliente(cliente_id, "✅ Membresía renovada",
      f"Tu plan {paquete['nombre']} se renovó. Vigente hasta el {fin.strftime('%d/%m/%Y')}.",
      {"tipo": "renovacion_exitosa"})
  elif inicio > hoy:
    await push_cliente(cliente_id, "🎉 ¡Pago confirmado!",
      f"{nombre1}, tu {paquete['nombre']} arranca el {inicio.strftime('%d/%m/%Y')}, cuando termine tu plan actual.",
      {"tipo": "pago_confirmado"})
  else:
    await push_cliente(cliente_id, "🎉 ¡Pago confirmado!",
      f"{nombre1}, tu {paquete['nombre']} ya está activo. ¡A entrenar!",
      {"tipo": "pago_confirmado"})

  print(f"💳 Paquete activado: {cliente.get('email')} | {paquete['nombre']} | {inicio} → {fin} | {metodo}")
  return {"ok": True, "inicio": inicio.isoformat(), "fin": fin.isoformat()}


async def marcar_penalizacion_pagada(pen: dict, payment_intent_id: str | None, receipt_url: str | None,
                                     metodo: str, session_id: str | None = None, comision: float | None = None):
  if payment_intent_id and _uno("pagos", "id", stripe_payment_intent_id=payment_intent_id):
    return
  supabase.table("penalizaciones_noshow").update({
    "estatus":                  "Pagado",
    "stripe_payment_intent_id": payment_intent_id,
  }).eq("id", pen["id"]).execute()

  cliente = _uno("clientes", "sucursal_id", id=pen["cliente_id"]) or {}
  supabase.table("pagos").insert({
    "cliente_id":                 pen["cliente_id"],
    "sucursal_id":                cliente.get("sucursal_id"),
    "monto":                      pen["monto"],
    "estatus":                    "Completado",
    "metodo_pago":                metodo,
    "canal":                      "Stripe",
    "concepto":                   "Penalización No Show",
    "fecha_pago":                 datetime.now(CDMX).isoformat(),
    "stripe_checkout_session_id": session_id,
    "stripe_payment_intent_id":   payment_intent_id,
    "receipt_url":                receipt_url,
    "comision":                   comision,
    "metadata":                   {"penalizacion_id": pen["id"], "clase_id": pen.get("clase_id")},
  }).execute()


async def registrar_oxxo_pendiente(*, cliente_id: str, monto: float, concepto: str,
                                   sucursal_id: str | None, voucher_url: str | None, metadata: dict,
                                   session_id: str | None = None, payment_intent_id: str | None = None):
  if session_id and _uno("pagos", "id", stripe_checkout_session_id=session_id):
    return
  if payment_intent_id and _uno("pagos", "id", stripe_payment_intent_id=payment_intent_id):
    return
  supabase.table("pagos").insert({
    "cliente_id":                 cliente_id,
    "sucursal_id":                sucursal_id,
    "monto":                      monto,
    "estatus":                    "Pendiente",
    "metodo_pago":                "OXXO",
    "canal":                      "Stripe",
    "concepto":                   concepto,
    "fecha_pago":                 datetime.now(CDMX).isoformat(),
    "stripe_checkout_session_id": session_id,
    "stripe_payment_intent_id":   payment_intent_id,
    "receipt_url":                voucher_url,
    "metadata":                   metadata,
  }).execute()
  await push_cliente(cliente_id, "🧾 Tu ficha OXXO está lista",
    "Tienes 3 días para pagar en cualquier OXXO. Tu paquete se activa en cuanto se acredite el pago.",
    {"tipo": "oxxo_pendiente", "voucher_url": voucher_url or ""})


def marcar_pago_fallido(session_id: str, estatus: str = "Fallido"):
  supabase.table("pagos").update({"estatus": estatus})\
    .eq("stripe_checkout_session_id", session_id).eq("estatus", "Pendiente").execute()


# ─── Clientes nuevos que pagan con un link ───────────────────────────────────
async def _crear_acceso(cliente_id: str, email: str):
  """Usuario de Supabase Auth para que entre a la app con su correo y código (sin contraseña)."""
  url = os.getenv("SUPABASE_URL")
  key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
  try:
    async with httpx.AsyncClient(timeout=15.0) as client:
      r = await client.post(f"{url}/auth/v1/admin/users",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"email": email, "email_confirm": True})
    if r.status_code in (200, 201) and r.json().get("id"):
      supabase.table("clientes").update({"supabase_user_id": r.json()["id"]}).eq("id", cliente_id).execute()
    # 422 = ya existía un usuario con ese correo: puede entrar igual
  except Exception as e:
    print("Error creando acceso:", e)


async def asegurar_cliente(*, email: str | None, nombre: str | None, telefono: str | None,
                           sucursal_id: str | None, stripe_customer_id: str | None) -> str:
  if not email:
    raise ValueError("El pago no trae correo")
  email = email.strip().lower()
  provisional = email.split("@")[0]
  nombre = " ".join((nombre or "").split()) or None

  r = supabase.table("clientes").select("id, nombre_completo, stripe_customer_id, supabase_user_id")\
    .ilike("email", email).limit(1).execute()
  if r.data:
    c = r.data[0]
    upd = {}
    if stripe_customer_id and not c.get("stripe_customer_id"):
      upd["stripe_customer_id"] = stripe_customer_id
    if nombre and (c.get("nombre_completo") or "") in ("", provisional):
      upd["nombre_completo"] = nombre
    if upd:
      supabase.table("clientes").update(upd).eq("id", c["id"]).execute()
    if not c.get("supabase_user_id"):
      await _crear_acceso(c["id"], email)
    return c["id"]

  try:
    nuevo = supabase.table("clientes").insert({
      "nombre_completo":     nombre or provisional,
      "email":               email,
      "telefono":            telefono,
      "sucursal_id":         sucursal_id,
      "estatus":             "Activo",
      "origen":              "Link de pago",
      "fecha_alta_original": hoy_cdmx().isoformat(),
      "stripe_customer_id":  stripe_customer_id,
    }).execute()
    cliente_id = nuevo.data[0]["id"]
  except Exception:
    # Otro evento lo creó al mismo tiempo
    r = supabase.table("clientes").select("id").ilike("email", email).limit(1).execute()
    if r.data:
      return r.data[0]["id"]
    raise

  await _crear_acceso(cliente_id, email)
  try:
    async with httpx.AsyncClient(timeout=15.0) as client:
      await client.post(f"{FRONTEND_URL}/api/correo/bienvenida-cliente",
                        json={"email": email, "nombre": nombre or provisional})
  except Exception as e:
    print("Error correo bienvenida:", e)
  print(f"🆕 Cliente creado por link de pago: {email}")
  return cliente_id