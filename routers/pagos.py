from fastapi        import APIRouter, HTTPException
from pydantic       import BaseModel
from services.orkestapay import get_access_token, crear_orden, registrar_pago, BASE_URL
from services.supabase   import supabase
from services.email      import enviar_comprobante_compra
import uuid
import httpx
import os

router = APIRouter()

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://crm.navytrainingcenter.com")

class PagoRequest(BaseModel):
  cliente_id:        str
  paquete_id:        str
  payment_method_id: str
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

class CrearCheckoutRequest(BaseModel):
  cliente_id:                 str
  paquete_id:                 str
  sucursal_id:                str
  payment_method_id:          str = ''
  device_session_id:          str = ''
  monto:                      float
  allow_save_payment_methods: bool = True


async def _enviar_comprobante_app(
  email: str, nombre: str, paquete: dict,
  fecha_inicio: str, fecha_fin: str,
  monto: float, order_id: str,
  sucursal_nombre: str, tiene_membresia_previa: bool,
):
  """Llama al endpoint de Next.js que genera el correo comprobante dark premium."""
  try:
    async with httpx.AsyncClient(timeout=15.0) as client:
      res = await client.post(
        f"{FRONTEND_URL}/api/correo/comprobante-pago",
        json={
          "email":                  email,
          "nombre":                 nombre,
          "paquete_nombre":         paquete.get("nombre"),
          "vigencia_dias":          paquete.get("vigencia_dias", 30),
          "clases_incluidas":       paquete.get("clases_incluidas"),
          "acceso_total":           paquete.get("acceso_total", False),
          "acceso_sucursal_hermana":paquete.get("acceso_sucursal_hermana", False),
          "es_recurrente":          paquete.get("es_recurrente", False),
          "descripcion":            paquete.get("descripcion"),
          "fecha_inicio":           fecha_inicio,
          "fecha_fin":              fecha_fin,
          "monto":                  monto,
          "metodo_pago":            "Tarjeta",
          "referencia":             order_id,
          "sucursal_nombre":        sucursal_nombre,
          "tiene_membresia_previa": tiene_membresia_previa,
          "folio":                  order_id,
        },
      )
      print("Comprobante app status:", res.status_code)
  except Exception as e:
    print("Error enviando comprobante app:", e)


@router.post("/procesar")
async def procesar_pago(req: PagoRequest):
  cliente_res = supabase.table("clientes").select("nombre_completo, email, sucursal_id")\
    .eq("id", req.cliente_id).single().execute()
  paquete_res = supabase.table("paquetes")\
    .select("id, nombre, vigencia_dias, clases_incluidas, acceso_total, acceso_sucursal_hermana, es_recurrente, descripcion")\
    .eq("id", req.paquete_id).single().execute()

  if not cliente_res.data or not paquete_res.data:
    raise HTTPException(status_code=404, detail="Cliente o paquete no encontrado")

  cliente = cliente_res.data
  paquete = paquete_res.data

  sucursal_res = supabase.table("sucursales").select("nombre")\
    .eq("id", cliente.get("sucursal_id", "")).single().execute()
  sucursal_nombre = sucursal_res.data["nombre"] if sucursal_res.data else "Navy Training Center"

  merchant_order_id = str(uuid.uuid4()).replace("-", "")[:16]
  idempotency_key   = str(uuid.uuid4()).replace("-", "")

  try:
    token  = await get_access_token()
    orden  = await crear_orden(token, {"nombre": cliente["nombre_completo"], "email": cliente["email"]}, paquete, req.monto, merchant_order_id)
    order_id = orden["order_id"]
    pago   = await registrar_pago(token, order_id, req.payment_method_id, req.device_session_id, idempotency_key)

    if pago["status"] != "COMPLETED":
      raise HTTPException(status_code=400, detail="Pago no completado")

    from datetime import date, timedelta
    fecha_inicio = date.today().isoformat()
    fecha_fin    = (date.today() + timedelta(days=paquete.get("vigencia_dias", 30))).isoformat()

    supabase.table("pagos").insert({
      "cliente_id":        req.cliente_id,
      "monto":             req.monto,
      "estatus":           "Completado",
      "metodo_pago":       "Tarjeta",
      "canal":             "Navy",
      "concepto":          f"{paquete['nombre']} — inscripción",
      "orkestapay_order_id": order_id,
      "metadata":          {"orkestapay_payment_id": pago["payment_id"]},
    }).execute()

    supabase.table("membresias").update({"estatus": "Inactiva"})\
      .eq("cliente_id", req.cliente_id).eq("estatus", "Activa").execute()

    supabase.table("membresias").insert({
      "cliente_id":    req.cliente_id,
      "paquete_id":    req.paquete_id,
      "fecha_inicio":  fecha_inicio,
      "fecha_fin":     fecha_fin,
      "estatus":       "Activa",
      "precio_pagado": req.monto,
      "origen":        "App",
    }).execute()

    await _enviar_comprobante_app(
      email                  = cliente["email"],
      nombre                 = cliente["nombre_completo"],
      paquete                = paquete,
      fecha_inicio           = fecha_inicio,
      fecha_fin              = fecha_fin,
      monto                  = req.monto,
      order_id               = order_id,
      sucursal_nombre        = sucursal_nombre,
      tiene_membresia_previa = False,
    )

    return {"ok": True, "payment_id": pago["payment_id"], "order_id": order_id, "fecha_fin": fecha_fin}

  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))


@router.post("/crear-checkout")
async def crear_checkout(req: CrearCheckoutRequest):
  from services.orkestapay import get_access_token_sucursal, crear_customer

  paquete_res = supabase.table("paquetes").select("nombre").eq("id", req.paquete_id).single().execute()
  paquete     = paquete_res.data

  cliente_res = supabase.table("clientes").select("nombre_completo, email, orkestapay_customer_id")\
    .eq("id", req.cliente_id).single().execute()
  cliente     = cliente_res.data

  customer_id = cliente.get("orkestapay_customer_id")
  if not customer_id:
    customer_id = await crear_customer(req.sucursal_id, cliente)
    supabase.table("clientes").update({"orkestapay_customer_id": customer_id})\
      .eq("id", req.cliente_id).execute()

  token, keys = await get_access_token_sucursal(req.sucursal_id)
  ambiente    = keys["ambiente"]
  base_url    = "https://api.orkestapay.com/v1" if ambiente == "production" else "https://api.sand.orkestapay.com/v1"
  merchant_order_id = str(uuid.uuid4()).replace("-", "")[:16]

  async with httpx.AsyncClient(timeout=30.0) as client:
    res = await client.post(
      f"{base_url}/checkouts",
      headers={"Authorization": f"Bearer {token}", "Accept": "application/json", "Content-Type": "application/json"},
      json={
        "completed_redirect_url":     f"{FRONTEND_URL}/pago/completado",
        "canceled_redirect_url":      f"{FRONTEND_URL}/pago/cancelado",
        "allow_save_payment_methods": req.allow_save_payment_methods,
        "customer_id":                customer_id,
        "locale":                     "ES_LATAM",
        "order": {
          "merchant_order_id": merchant_order_id,
          "currency":          "MXN",
          "subtotal_amount":   req.monto,
          "total_amount":      req.monto,
          "country_code":      "MX",
          "products": [{
            "product_id": req.paquete_id,
            "name":       paquete["nombre"],
            "quantity":   1,
            "unit_price": req.monto,
          }],
          "customer": {
            "first_name": cliente["nombre_completo"].split()[0],
            "last_name":  " ".join(cliente["nombre_completo"].split()[1:]) or "N/A",
            "email":      cliente["email"],
          },
        },
      },
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

  # Cliente
  cliente_res = supabase.table("clientes").select("nombre_completo, email, sucursal_id")\
    .eq("id", req.cliente_id).single().execute()
  if not cliente_res.data:
    raise HTTPException(status_code=404, detail="Cliente no encontrado")
  cliente = cliente_res.data

  # Sucursal
  sucursal_res = supabase.table("sucursales").select("nombre")\
    .eq("id", cliente.get("sucursal_id", "")).single().execute()
  sucursal_nombre = sucursal_res.data["nombre"] if sucursal_res.data else "Navy Training Center"

  # Paquete con todos los campos para el correo
  paquete_res = supabase.table("paquetes").select(
    "nombre, vigencia_dias, clases_incluidas, acceso_total, acceso_sucursal_hermana, es_recurrente, descripcion"
  ).eq("id", req.paquete_id).single().execute()
  paquete = paquete_res.data
  if not paquete:
    raise HTTPException(status_code=404, detail="Paquete no encontrado")

  # Membresía activa → cola o activa inmediata
  memb_activa = supabase.table("membresias").select("fecha_fin")\
    .eq("cliente_id", req.cliente_id).eq("estatus", "Activa")\
    .order("fecha_fin", desc=True).limit(1).execute()

  tiene_membresia_previa = bool(memb_activa.data)

  if memb_activa.data:
    fecha_fin_actual = date.fromisoformat(memb_activa.data[0]["fecha_fin"])
    hoy = date.today()
    fecha_inicio = max(hoy, fecha_fin_actual).isoformat()
  else:
    fecha_inicio = date.today().isoformat()

  fecha_fin = (date.fromisoformat(fecha_inicio) + timedelta(days=paquete.get("vigencia_dias", 30))).isoformat()

  # Guardar pago
  supabase.table("pagos").insert({
    "cliente_id":             req.cliente_id,
    "monto":                  req.monto,
    "estatus":                "Completado",
    "metodo_pago":            "Tarjeta",
    "canal":                  "Navy",
    "concepto":               f"{paquete['nombre']} — inscripción",
    "fecha_pago":             date.today().isoformat(),
    "orkestapay_checkout_id": req.checkout_id,
    "orkestapay_order_id":    req.order_id,
  }).execute()

  # Crear membresía
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
    "plan":            paquete["nombre"],
    "paquete_id":      req.paquete_id,
    "fecha_venc_plan": fecha_fin,
  }).eq("id", req.cliente_id).execute()

  # Comprobante premium
  await _enviar_comprobante_app(
    email                  = cliente["email"],
    nombre                 = cliente["nombre_completo"],
    paquete                = paquete,
    fecha_inicio           = fecha_inicio,
    fecha_fin              = fecha_fin,
    monto                  = req.monto,
    order_id               = req.order_id,
    sucursal_nombre        = sucursal_nombre,
    tiene_membresia_previa = tiene_membresia_previa,
  )

  return {"ok": True}


@router.post("/pagar-penalizacion")
async def pagar_penalizacion(req: PagarPenalizacionRequest):
  from services.orkestapay import get_access_token_sucursal

  pen_res = supabase.table("penalizaciones_noshow")\
    .select("*, clientes(nombre_completo, email, sucursal_id)")\
    .eq("id", req.penalizacion_id).eq("estatus", "Pendiente")\
    .single().execute()

  if not pen_res.data:
    raise HTTPException(status_code=404, detail="Penalización no encontrada")

  pen     = pen_res.data
  monto   = pen["monto"]
  cliente = pen["clientes"]

  sucursal_id = cliente["sucursal_id"]
  token, keys = await get_access_token_sucursal(sucursal_id)
  ambiente    = keys["ambiente"]
  base_url    = "https://api.orkestapay.com/v1" if ambiente == "production" else "https://api.sand.orkestapay.com/v1"
  merchant_order_id = str(uuid.uuid4()).replace("-", "")[:16]

  async with httpx.AsyncClient(timeout=30.0) as client:
    res = await client.post(
      f"{base_url}/checkouts",
      headers={"Authorization": f"Bearer {token}", "Accept": "application/json", "Content-Type": "application/json"},
      json={
        "completed_redirect_url": f"{FRONTEND_URL}/pago/completado",
        "canceled_redirect_url":  f"{FRONTEND_URL}/pago/cancelado",
        "allow_save_payment_methods": False,
        "locale": "ES_LATAM",
        "order": {
          "merchant_order_id": merchant_order_id,
          "currency":          "MXN",
          "subtotal_amount":   monto,
          "total_amount":      monto,
          "country_code":      "MX",
          "products": [{"product_id": req.penalizacion_id, "name": "Penalización No Show", "quantity": 1, "unit_price": monto}],
          "customer": {
            "first_name": cliente["nombre_completo"].split()[0],
            "last_name":  " ".join(cliente["nombre_completo"].split()[1:]) or "N/A",
            "email":      cliente["email"],
          },
        },
      },
    )
    res.raise_for_status()
    data = res.json()

  return {"checkout_url": data["checkout_redirect_url"], "checkout_id": data["checkout_id"], "order_id": data["order"]["order_id"]}


@router.post("/confirmar-penalizacion")
async def confirmar_penalizacion(req: dict):
  penalizacion_id = req.get("penalizacion_id")
  order_id        = req.get("order_id")

  supabase.table("penalizaciones_noshow").update({
    "estatus":               "Pagado",
    "orkestapay_payment_id": order_id,
  }).eq("id", penalizacion_id).execute()

  return {"ok": True}


@router.post("/crear-customer")
async def crear_customer_endpoint(req: dict):
  cliente_id  = req.get("cliente_id")
  sucursal_id = req.get("sucursal_id")

  cli = supabase.table("clientes").select("nombre_completo, email, orkestapay_customer_id")\
    .eq("id", cliente_id).single().execute()

  if not cli.data:
    raise HTTPException(status_code=404, detail="Cliente no encontrado")

  if cli.data.get("orkestapay_customer_id"):
    return {"customer_id": cli.data["orkestapay_customer_id"]}

  from services.orkestapay import crear_customer
  customer_id = await crear_customer(sucursal_id, cli.data)

  supabase.table("clientes").update({"orkestapay_customer_id": customer_id})\
    .eq("id", cliente_id).execute()

  return {"customer_id": customer_id}


@router.get("/metodos-pago/{cliente_id}")
async def listar_metodos_pago_endpoint(cliente_id: str):
  from services.orkestapay import listar_metodos_pago

  cli = supabase.table("clientes").select("orkestapay_customer_id, sucursal_id")\
    .eq("id", cliente_id).single().execute()

  if not cli.data or not cli.data.get("orkestapay_customer_id"):
    return {"metodos": []}

  metodos = await listar_metodos_pago(cli.data["sucursal_id"], cli.data["orkestapay_customer_id"])
  return {"metodos": metodos}


@router.post("/cobrar-tarjeta")
async def cobrar_tarjeta_endpoint(req: dict):
  from services.orkestapay import cobrar_tarjeta_guardada
  from datetime import date

  cliente_id        = req.get("cliente_id")
  payment_method_id = req.get("payment_method_id")
  monto             = req.get("monto")
  concepto          = req.get("concepto", "Compra De Gali")

  cli = supabase.table("clientes")\
    .select("orkestapay_customer_id, sucursal_id, nombre_completo, email")\
    .eq("id", cliente_id).single().execute()

  if not cli.data or not cli.data.get("orkestapay_customer_id"):
    raise HTTPException(status_code=400, detail="Cliente no tiene customer de OrkestaPay")

  sucursal_id     = cli.data["sucursal_id"]
  idempotency_key = str(uuid.uuid4()).replace("-", "")

  try:
    resultado = await cobrar_tarjeta_guardada(
      sucursal_id       = sucursal_id,
      customer_id       = cli.data["orkestapay_customer_id"],
      payment_method_id = payment_method_id,
      monto             = monto,
      concepto          = concepto,
      idempotency_key   = idempotency_key,
    )

    exitoso = resultado.get("status") == "COMPLETED"

    supabase.table("pagos").insert({
      "cliente_id":          cliente_id,
      "sucursal_id":         sucursal_id,
      "monto":               monto,
      "estatus":             "Completado" if exitoso else "Fallido",
      "metodo_pago":         "Tarjeta",
      "canal":               "OrkestaPay",
      "concepto":            concepto,
      "fecha_pago":          date.today().isoformat(),
      "orkestapay_order_id": resultado.get("order_id"),
      "metadata":            {"orkestapay_payment_id": resultado.get("payment_id")},
    }).execute()

    if not exitoso:
      raise HTTPException(status_code=400, detail="Pago no completado")

    # Comprobante simple para cobros de Gali
    try:
      await enviar_comprobante_compra(
        email       = cli.data.get("email"),
        nombre      = cli.data.get("nombre_completo"),
        monto       = monto,
        metodo_pago = "Tarjeta guardada",
        folio       = resultado.get("payment_id"),
        concepto    = concepto,
      )
    except Exception as e:
      print("Error enviando comprobante (cobrar-tarjeta):", e)

    return {"ok": True, "payment_id": resultado.get("payment_id")}

  except HTTPException:
    raise
  except Exception as e:
    supabase.table("pagos").insert({
      "cliente_id":  cliente_id,
      "sucursal_id": sucursal_id,
      "monto":       monto,
      "estatus":     "Fallido",
      "metodo_pago": "Tarjeta",
      "canal":       "OrkestaPay",
      "concepto":    concepto,
      "fecha_pago":  date.today().isoformat(),
    }).execute()
    raise HTTPException(status_code=500, detail=str(e))