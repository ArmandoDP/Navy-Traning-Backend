# routers/cobros.py  →  prefijo /cobros
# Recepción cobra sin terminal: a la tarjeta guardada del cliente, o enviándole el cobro a su app.
import os
import stripe
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, HTMLResponse
from services.supabase import supabase
from services.auth_app import staff_de_sesion, autorizar_cliente
from services import stripe_service as ss
from services.stripe_activacion import _uno, CDMX, activar_paquete, push_cliente, correo_simple

router = APIRouter()
BACKEND_PUBLIC_URL = os.getenv("BACKEND_PUBLIC_URL", "https://navy-traning-backend-production.up.railway.app")


def _tarjeta(cliente_id: str) -> dict | None:
  cus = ss._customer_existente(cliente_id)
  pm_id = ss.tarjeta_principal(cus) if cus else None
  if not pm_id:
    return None
  try:
    pm = stripe.PaymentMethod.retrieve(pm_id)
    card = pm.get("card") or {}
    return {"id": pm_id, "marca": (card.get("brand") or "tarjeta").upper(), "ultimos4": card.get("last4"),
            "vence": f"{card.get('exp_month', 0):02d}/{card.get('exp_year', '')}" if card else None}
  except Exception:
    return {"id": pm_id, "marca": "TARJETA", "ultimos4": None, "vence": None}


def _log(staff: dict, cli: dict, tipo: str, descripcion: str, metadata: dict):
  quien = " ".join(f"{staff.get('nombre') or ''} {staff.get('primer_apellido') or ''}".split())
  try:
    supabase.table("actividad_log").insert({
      "tipo": tipo, "tabla": "pagos", "accion": "INSERT",
      "descripcion": f"{quien} {descripcion} — {cli.get('nombre_completo') or cli.get('email')}",
      "metadata": {"cliente_id": cli["id"], **metadata},
      "sucursal_id": cli.get("sucursal_id"), "staff_id": staff.get("id"),
    }).execute()
  except Exception as e:
    print("log cobros:", e)


def _url_pago(solicitud_id: str) -> str:
  return f"{BACKEND_PUBLIC_URL}/cobros/solicitudes/{solicitud_id}/pagar"


def _vigente(sol: dict) -> dict:
  """Marca como expirada una solicitud pendiente que ya pasó su fecha."""
  if sol.get("estatus") == "Pendiente" and sol.get("expira_en"):
    if datetime.fromisoformat(sol["expira_en"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
      supabase.table("solicitudes_pago").update({"estatus": "Expirada"}).eq("id", sol["id"]).execute()
      sol["estatus"] = "Expirada"
  return sol


# ─── Qué opciones tiene recepción para cobrarle a este cliente ──────────────
@router.get("/opciones/{cliente_id}")
async def opciones(cliente_id: str, request: Request):
  staff_de_sesion(request)
  cli = _uno("clientes", "id, email, supabase_user_id", id=cliente_id)
  if not cli:
    raise HTTPException(status_code=404, detail="Cliente no encontrado")
  try:
    tarjeta = _tarjeta(cliente_id)
  except Exception as e:
    print("opciones tarjeta:", e)
    tarjeta = None
  dispositivos = supabase.table("push_tokens").select("token").eq("cliente_id", cliente_id).execute().data or []
  return {"tarjeta": tarjeta, "tiene_app": bool(cli.get("supabase_user_id")),
          "dispositivos": len(dispositivos), "email": cli.get("email")}


# ─── Cobrar un paquete a la tarjeta guardada ────────────────────────────────
@router.post("/paquete-tarjeta")
async def paquete_tarjeta(request: Request):
  staff = staff_de_sesion(request)
  b = await request.json()
  cliente_id, paquete_id = b.get("cliente_id"), b.get("paquete_id")
  cli = _uno("clientes", "id, nombre_completo, email, sucursal_id", id=cliente_id)
  if not cli or not paquete_id:
    raise HTTPException(status_code=400, detail="Faltan el cliente o el paquete")
  tarjeta = _tarjeta(cliente_id)
  if not tarjeta:
    raise HTTPException(status_code=400, detail="El cliente no tiene tarjeta guardada. Envíale el cobro a su app.")

  try:
    c = ss._preparar_compra(cliente_id, paquete_id, None, "crm_tarjeta")
  except ValueError as e:
    raise HTTPException(status_code=400, detail=str(e))
  paq, monto, memb, customer, meta = c["paq"], c["monto"], c["memb"], c["customer"], c["meta"]
  etiqueta = f"{tarjeta['marca']} •••• {tarjeta['ultimos4']}" if tarjeta.get("ultimos4") else "su tarjeta"

  if paq.get("es_recurrente"):
    extra = {"default_payment_method": tarjeta["id"], "off_session": True, "payment_behavior": "error_if_incomplete"}
    inicio = ss._trial_end(memb)
    if inicio:
      extra["trial_end"] = inicio
    try:
      sub = ss.crear_suscripcion(customer, paq, monto, meta, **extra)
    except stripe.error.CardError as e:
      raise HTTPException(status_code=402, detail=(e.user_message or "La tarjeta fue rechazada") +
                          ". Puedes enviarle el cobro a su app para que pague con otra tarjeta.")
    supabase.table("clientes").update({"stripe_subscription_id": sub.id}).eq("id", cliente_id).execute()
    if inicio:
      fecha = datetime.fromtimestamp(inicio, CDMX).strftime("%d/%m/%Y")
      if memb:
        supabase.table("membresias").update({"stripe_subscription_id": sub.id, "renovacion_cancelada": False})\
          .eq("id", memb["id"]).execute()
      await push_cliente(cliente_id, "🔄 Renovación activada",
        f"Tu {paq['nombre']} se cobrará a tu {etiqueta} el {fecha}, cuando termine tu plan actual.",
        {"tipo": "renovacion_activada"})
      _log(staff, cli, "cobro_tarjeta", f"programó {paq['nombre']} (${monto:,.2f}) a {etiqueta} para el {fecha}",
           {"paquete_id": paquete_id, "monto": monto, "programado": fecha})
      return {"ok": True, "programado": fecha, "metodo": etiqueta, "monto": monto, "recurrente": True}
    # Se cobró ya: el webhook de la factura activa el plan y manda el comprobante
    _log(staff, cli, "cobro_tarjeta", f"cobró {paq['nombre']} (${monto:,.2f}) a {etiqueta}",
         {"paquete_id": paquete_id, "monto": monto, "suscripcion": sub.id})
    return {"ok": True, "metodo": etiqueta, "monto": monto, "recurrente": True}

  try:
    pi = stripe.PaymentIntent.create(
      amount=ss.centavos(monto), currency="mxn", customer=customer, payment_method=tarjeta["id"],
      off_session=True, confirm=True, description=f"{paq['nombre']} — Navy Training Center",
      metadata=ss._meta({**meta, "flujo": "crm_tarjeta"}), expand=["latest_charge"],
    )
  except stripe.error.CardError as e:
    autorizacion = (e.code == "authentication_required")
    raise HTTPException(status_code=402, detail=(
      "El banco pidió que el cliente autorice el pago. Envíale el cobro a su app." if autorizacion
      else (e.user_message or "La tarjeta fue rechazada") + ". Puedes enviarle el cobro a su app."))
  if pi.status != "succeeded":
    raise HTTPException(status_code=402, detail="El banco pidió que el cliente autorice el pago. Envíale el cobro a su app.")

  ch = pi.latest_charge
  res = await activar_paquete(
    cliente_id=cliente_id, paquete_id=paquete_id, monto=monto, sucursal_id=meta.get("sucursal_id"),
    metodo=ss.etiqueta_metodo(ch), origen="crm_tarjeta", payment_intent_id=pi.id,
    receipt_url=ch.receipt_url if ch else None, comision=ss.comision_de(ch),
  )
  _log(staff, cli, "cobro_tarjeta", f"cobró {paq['nombre']} (${monto:,.2f}) a {etiqueta}",
       {"paquete_id": paquete_id, "monto": monto, "payment_intent": pi.id})
  return {"ok": True, "metodo": etiqueta, "monto": monto, "recurrente": False, "activacion": res}


# ─── Enviar el cobro a su app ───────────────────────────────────────────────
@router.post("/solicitudes")
async def crear_solicitud(request: Request):
  staff = staff_de_sesion(request)
  b = await request.json()
  cliente_id, paquete_id = b.get("cliente_id"), b.get("paquete_id")
  cli = _uno("clientes", "id, nombre_completo, email, sucursal_id", id=cliente_id)
  if not cli or not paquete_id:
    raise HTTPException(status_code=400, detail="Faltan el cliente o el paquete")
  try:
    c = ss._preparar_compra(cliente_id, paquete_id, None, "solicitud")
  except ValueError as e:
    raise HTTPException(status_code=400, detail=str(e))
  paq, monto = c["paq"], c.get("monto_hoy", c["monto"])

  # Un solo cobro pendiente por cliente: el nuevo reemplaza al anterior
  supabase.table("solicitudes_pago").update({"estatus": "Cancelada"})\
    .eq("cliente_id", cliente_id).eq("estatus", "Pendiente").execute()
  sol = supabase.table("solicitudes_pago").insert({
    "cliente_id": cliente_id, "paquete_id": paquete_id, "sucursal_id": c["meta"].get("sucursal_id"),
    "concepto": paq["nombre"], "monto": monto, "creada_por": staff.get("id"),
  }).execute().data[0]
  url = _url_pago(sol["id"])
  nombre1 = (cli.get("nombre_completo") or "").split(" ")[0]

  await push_cliente(cliente_id, "💳 Tu pago está listo",
    f"{paq['nombre']} · ${monto:,.0f}. Toca para pagar desde la app.",
    {"tipo": "solicitud_pago", "solicitud_id": sol["id"], "url": url})
  try:
    await correo_simple(cli.get("email"), nombre1 or "Hola", f"Tu pago de {paq['nombre']} está listo", f"""
      Recepción te envió el cobro de <b>{paq['nombre']}</b> por <b>${monto:,.2f} MXN</b>.<br><br>
      Puedes pagarlo desde la app de Navy (te llegó una notificación) o con este botón:<br><br>
      <a href="{url}" style="display:inline-block;background:#171B24;color:#ffffff;text-decoration:none;
         padding:14px 28px;border-radius:12px;font-weight:bold">Pagar ${monto:,.0f}</a><br><br>
      Tu tarjeta quedará guardada para tus renovaciones. Este enlace vence en 48 horas.""")
  except Exception as e:
    print("correo solicitud:", e)

  _log(staff, cli, "cobro_enviado", f"envió el cobro de {paq['nombre']} (${monto:,.2f}) a su app",
       {"solicitud_id": sol["id"], "paquete_id": paquete_id, "monto": monto})
  return {**sol, "url_pago": url, "paquete": paq["nombre"]}


@router.get("/solicitudes/{solicitud_id}")
async def ver_solicitud(solicitud_id: str, request: Request):
  sol = _uno("solicitudes_pago", "*", id=solicitud_id)
  if not sol:
    raise HTTPException(status_code=404, detail="Cobro no encontrado")
  autorizar_cliente(request, sol["cliente_id"])   # el propio cliente o staff
  return _vigente(sol)


@router.get("/pendientes/{cliente_id}")
async def pendientes(cliente_id: str, request: Request):
  autorizar_cliente(request, cliente_id)
  filas = supabase.table("solicitudes_pago").select("*").eq("cliente_id", cliente_id)\
    .eq("estatus", "Pendiente").order("created_at", desc=True).limit(5).execute().data or []
  vigentes = [s for s in (_vigente(f) for f in filas) if s["estatus"] == "Pendiente"]
  return {"pendientes": [{**s, "url_pago": _url_pago(s["id"])} for s in vigentes]}


@router.post("/solicitudes/{solicitud_id}/cancelar")
async def cancelar_solicitud(solicitud_id: str, request: Request):
  staff = staff_de_sesion(request)
  sol = _uno("solicitudes_pago", "*", id=solicitud_id)
  if not sol:
    raise HTTPException(status_code=404, detail="Cobro no encontrado")
  if sol["estatus"] == "Pendiente":
    supabase.table("solicitudes_pago").update({"estatus": "Cancelada"}).eq("id", solicitud_id).execute()
    cli = _uno("clientes", "id, nombre_completo, email, sucursal_id", id=sol["cliente_id"]) or {"id": sol["cliente_id"]}
    _log(staff, cli, "cobro_cancelado", f"canceló el cobro enviado de {sol.get('concepto')}", {"solicitud_id": solicitud_id})
  return {"ok": True}


def _pagina(titulo: str, texto: str, ok: bool) -> HTMLResponse:
  color = "#16a34a" if ok else "#6b7280"
  return HTMLResponse(f"""<!DOCTYPE html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{titulo}</title></head><body style="margin:0;font-family:Arial,sans-serif;background:#171B24;color:#fff;
display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px">
<div><div style="font-size:56px;color:{color}">{'✓' if ok else '•'}</div>
<h1 style="font-size:24px;margin:12px 0 8px">{titulo}</h1><p style="color:#9ca3af;font-size:15px;line-height:22px">{texto}</p>
</div></body></html>""")


@router.get("/solicitudes/{solicitud_id}/pagar")
async def pagar_solicitud(solicitud_id: str):
  """Público (el enlace es secreto): lleva al cliente al pago de Stripe."""
  sol = _uno("solicitudes_pago", "*", id=solicitud_id)
  if not sol:
    return _pagina("Cobro no encontrado", "Pide a recepción que te envíe el cobro de nuevo.", False)
  sol = _vigente(sol)
  if sol["estatus"] == "Pagada":
    return _pagina("Ya está pagado", "Tu plan ya quedó activo. Puedes cerrar esta ventana.", True)
  if sol["estatus"] != "Pendiente":
    return _pagina("Este cobro ya no está disponible", "Pide a recepción que te envíe uno nuevo.", False)
  try:
    co = ss.checkout_paquete(sol["cliente_id"], sol["paquete_id"], sol.get("sucursal_id"), "solicitud",
                             extra_meta={"solicitud_id": solicitud_id})
  except ValueError as e:
    return _pagina("No se pudo abrir el pago", str(e), False)
  supabase.table("solicitudes_pago").update({"stripe_session_id": co["session_id"]}).eq("id", solicitud_id).execute()
  return RedirectResponse(co["url"], status_code=303)


def marcar_solicitud_pagada(solicitud_id: str):
  """La llama el webhook de Stripe cuando el pago se completa."""
  supabase.table("solicitudes_pago").update({
    "estatus": "Pagada", "pagada_en": datetime.now(timezone.utc).isoformat(),
  }).eq("id", solicitud_id).in_("estatus", ["Pendiente", "Expirada"]).execute()


# ─── Cancelar o reactivar la renovación automática (también en Stripe) ──────
@router.post("/renovacion/{membresia_id}")
async def renovacion(membresia_id: str, request: Request):
  staff = staff_de_sesion(request, roles=["direccion"])
  b = await request.json()
  cancelar = bool(b.get("cancelar"))
  memb = _uno("membresias", "id, cliente_id, fecha_fin, stripe_subscription_id, paquetes(nombre)", id=membresia_id)
  if not memb:
    raise HTTPException(status_code=404, detail="Membresía no encontrada")

  en_stripe = False
  sub_id = memb.get("stripe_subscription_id")
  if sub_id:
    try:
      # cancel_at_period_end: no se cancela de golpe; deja de cobrar al terminar el periodo pagado
      stripe.Subscription.modify(sub_id, cancel_at_period_end=cancelar)
      en_stripe = True
    except stripe.error.InvalidRequestError as e:
      print(f"renovación {sub_id}:", e.user_message or e)
  supabase.table("membresias").update({"renovacion_cancelada": cancelar}).eq("id", membresia_id).execute()

  cli = _uno("clientes", "id, nombre_completo, email, sucursal_id", id=memb["cliente_id"]) or {"id": memb["cliente_id"]}
  plan = (memb.get("paquetes") or {}).get("nombre", "")
  _log(staff, cli, "renovacion_cancelada" if cancelar else "renovacion_reactivada",
       f"{'canceló' if cancelar else 'reactivó'} la renovación automática de {plan}",
       {"membresia_id": membresia_id, "suscripcion": sub_id, "en_stripe": en_stripe})
  return {"ok": True, "cancelada": cancelar, "en_stripe": en_stripe}