from fastapi        import APIRouter, HTTPException
from pydantic       import BaseModel
from services.orkestapay import get_access_token, crear_orden, registrar_pago, BASE_URL
from services.supabase   import supabase
import uuid
import httpx

router = APIRouter()

class PagoRequest(BaseModel):
  cliente_id:        str
  paquete_id:        str
  payment_method_id: str   # token de tarjeta del WebView
  device_session_id: str
  monto:             float

class ConfirmarCheckoutRequest(BaseModel):
  cliente_id:  str
  paquete_id:  str
  checkout_id: str
  order_id:    str
  monto:       float
class PagarPenalizacionRequest(BaseModel):
  cliente_id:       str
  penalizacion_id:  str

@router.post("/procesar")
async def procesar_pago(req: PagoRequest):
  # 1. Traer datos del cliente y paquete
  cliente_res = supabase.table("clientes").select("nombre_completo, email").eq("id", req.cliente_id).single().execute()
  paquete_res = supabase.table("paquetes").select("id, nombre, vigencia_dias").eq("id", req.paquete_id).single().execute()

  if not cliente_res.data or not paquete_res.data:
    raise HTTPException(status_code=404, detail="Cliente o paquete no encontrado")

  cliente = { "nombre": cliente_res.data["nombre_completo"], "email": cliente_res.data["email"] }
  paquete = paquete_res.data

  merchant_order_id = str(uuid.uuid4()).replace("-", "")[:16]
  idempotency_key   = str(uuid.uuid4()).replace("-", "")

  try:
    # 2. Obtener token de OrkestaPay
    token = await get_access_token()

    # 3. Crear orden
    orden = await crear_orden(token, cliente, paquete, req.monto, merchant_order_id)
    order_id = orden["order_id"]

    # 4. Registrar pago
    pago = await registrar_pago(token, order_id, req.payment_method_id, req.device_session_id, idempotency_key)

    if pago["status"] != "COMPLETED":
      raise HTTPException(status_code=400, detail="Pago no completado")

    # 5. Guardar en Supabase
    from datetime import date, timedelta
    fecha_inicio = date.today().isoformat()
    fecha_fin    = (date.today() + timedelta(days=paquete.get("vigencia_dias", 30))).isoformat()

    supabase.table("pagos").insert({
      "cliente_id":   req.cliente_id,
      "monto":        req.monto,
      "estatus":      "Completado",
      "metodo_pago":  "Tarjeta",
      "canal":        "Navy",
      "concepto":     f"{paquete['nombre']} — inscripción",
      "orkestapay_payment_id": pago["payment_id"],
      "orkestapay_order_id":   order_id,
    }).execute()

    # Desactivar membresía anterior
    supabase.table("membresias").update({ "estatus": "Inactiva" })\
      .eq("cliente_id", req.cliente_id).eq("estatus", "Activa").execute()

    # Crear nueva membresía
    supabase.table("membresias").insert({
      "cliente_id":    req.cliente_id,
      "paquete_id":    req.paquete_id,
      "fecha_inicio":  fecha_inicio,
      "fecha_fin":     fecha_fin,
      "estatus":       "Activa",
      "precio_pagado": req.monto,
      "origen":        "App",
    }).execute()

    return {
      "ok":         True,
      "payment_id": pago["payment_id"],
      "order_id":   order_id,
      "fecha_fin":  fecha_fin,
    }

  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))


@router.post("/crear-checkout")
async def crear_checkout(req: PagoRequest):
  # 1. Traer datos
  cliente_res = supabase.table("clientes").select("nombre_completo, email").eq("id", req.cliente_id).single().execute()
  paquete_res = supabase.table("paquetes").select("id, nombre, vigencia_dias").eq("id", req.paquete_id).single().execute()

  if not cliente_res.data or not paquete_res.data:
    raise HTTPException(status_code=404, detail="Cliente o paquete no encontrado")

  cliente = cliente_res.data
  paquete = paquete_res.data
  merchant_order_id = str(uuid.uuid4()).replace("-", "")[:16]

  # 2. Obtener token
  token = await get_access_token()

  # 3. Crear checkout
  async with httpx.AsyncClient() as client:
    res = await client.post(
      f"{BASE_URL}/checkouts",
      headers={ "Authorization": f"Bearer {token}", "Accept": "application/json" },
      json={
        "completed_redirect_url": "https://crm.navytrainingcenter.com/pago/completado",
        "canceled_redirect_url":  "https://crm.navytrainingcenter.com/pago/cancelado",
        "allow_save_payment_methods": False,
        "locale": "ES_LATAM",
        "order": {
          "merchant_order_id": merchant_order_id,
          "currency":          "MXN",
          "subtotal_amount":   req.monto,
          "total_amount":      req.monto,
          "country_code":      "MX",
          "products": [{
            "product_id": paquete["id"],
            "name":       paquete["nombre"],
            "quantity":   1,
            "unit_price": req.monto,
          }],
          "customer": {
            "first_name": cliente["nombre_completo"].split()[0],
            "last_name":  " ".join(cliente["nombre_completo"].split()[1:]) or "N/A",
            "email":      cliente["email"],
          }
        }
      }
    )
    print("Checkout response:", res.status_code, res.text)
    res.raise_for_status()
    data = res.json()

  return {
    "checkout_url": data["checkout_redirect_url"],
    "checkout_id":  data["checkout_id"],
    "order_id":     data["order"]["order_id"],
  }


@router.post("/confirmar-checkout")
async def confirmar_checkout(req: ConfirmarCheckoutRequest):
  from datetime import date, timedelta

  paquete_res = supabase.table("paquetes").select("nombre, vigencia_dias")\
    .eq("id", req.paquete_id).single().execute()
  paquete = paquete_res.data

  fecha_inicio = date.today().isoformat()
  fecha_fin    = (date.today() + timedelta(days=paquete.get("vigencia_dias", 30))).isoformat()

  # Guardar pago
  supabase.table("pagos").insert({
    "cliente_id":              req.cliente_id,
    "monto":                   req.monto,
    "estatus":                 "Completado",
    "metodo_pago":             "Tarjeta",
    "canal":                   "Navy",
    "concepto":                f"{paquete['nombre']} — inscripción",
    "fecha_pago":              date.today().isoformat(),
    "orkestapay_checkout_id":  req.checkout_id,
    "orkestapay_order_id":     req.order_id,
  }).execute()

  # Desactivar membresía anterior
  supabase.table("membresias").update({ "estatus": "Inactiva" })\
    .eq("cliente_id", req.cliente_id).eq("estatus", "Activa").execute()

  # Crear nueva membresía
  supabase.table("membresias").insert({
    "cliente_id":    req.cliente_id,
    "paquete_id":    req.paquete_id,
    "fecha_inicio":  fecha_inicio,
    "fecha_fin":     fecha_fin,
    "estatus":       "Activa",
    "precio_pagado": req.monto,
    "origen":        "App",
  }).execute()

  # Actualizar cliente
  supabase.table("clientes").update({
    "plan":           paquete["nombre"],
    "paquete_id":     req.paquete_id,
    "fecha_venc_plan": fecha_fin,
  }).eq("id", req.cliente_id).execute()

  return { "ok": True }

@router.post("/pagar-penalizacion")
async def pagar_penalizacion(req: PagarPenalizacionRequest):
  # Traer penalización
  pen_res = supabase.table("penalizaciones_noshow")\
    .select("*, clientes(nombre_completo, email)")\
    .eq("id", req.penalizacion_id)\
    .eq("estatus", "Pendiente")\
    .single().execute()

  if not pen_res.data:
    raise HTTPException(status_code=404, detail="Penalización no encontrada")

  pen    = pen_res.data
  monto  = pen["monto"]
  cliente = pen["clientes"]

  # Crear checkout en OrkestaPay
  token = await get_access_token()
  merchant_order_id = str(uuid.uuid4()).replace("-", "")[:16]

  async with httpx.AsyncClient(timeout=30.0) as client:
    res = await client.post(
      f"{BASE_URL}/checkouts",
      headers={ "Authorization": f"Bearer {token}", "Accept": "application/json", "Content-Type": "application/json" },
      json={
        "completed_redirect_url": "https://crm.navytrainingcenter.com/pago/completado",
        "canceled_redirect_url":  "https://crm.navytrainingcenter.com/pago/cancelado",
        "allow_save_payment_methods": False,
        "locale": "ES_LATAM",
        "order": {
          "merchant_order_id": merchant_order_id,
          "currency":          "MXN",
          "subtotal_amount":   monto,
          "total_amount":      monto,
          "country_code":      "MX",
          "products": [{
            "product_id": req.penalizacion_id,
            "name":       "Penalización No Show",
            "quantity":   1,
            "unit_price": monto,
          }],
          "customer": {
            "first_name": cliente["nombre_completo"].split()[0],
            "last_name":  " ".join(cliente["nombre_completo"].split()[1:]) or "N/A",
            "email":      cliente["email"],
          }
        }
      }
    )
    res.raise_for_status()
    data = res.json()

  return {
    "checkout_url": data["checkout_redirect_url"],
    "checkout_id":  data["checkout_id"],
    "order_id":     data["order"]["order_id"],
  }

@router.post("/confirmar-penalizacion")
async def confirmar_penalizacion(req: dict):
  penalizacion_id = req.get("penalizacion_id")
  checkout_id     = req.get("checkout_id")
  order_id        = req.get("order_id")

  supabase.table("penalizaciones_noshow").update({
    "estatus":                "Pagado",
    "orkestapay_payment_id":  order_id,
  }).eq("id", penalizacion_id).execute()

  return { "ok": True }

