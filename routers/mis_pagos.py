# routers/mis_pagos.py  →  prefijo /mis-pagos
# Historial y detalle de pagos del cliente, comprobante en PDF y su tarjeta guardada.
import hashlib, hmac, os, time
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from services.supabase import supabase
from services import stripe_service as ss
from services.tarjetas import actualizar_tarjeta
from services.comprobante_pdf import comprobante_pdf
from routers.metas import _cliente

router = APIRouter()
CDMX = timezone(timedelta(hours=-6))
BACKEND = os.getenv("BACKEND_PUBLIC_URL", "https://navy-traning-backend-production.up.railway.app")
SECRETO = (os.getenv("COMPROBANTE_SECRET") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or "navy").encode()
SEL = "id, folio, concepto, monto, metodo_pago, fecha_pago, estatus, sucursal_id, canal, receipt_url, metadata, " \
      "stripe_payment_intent_id, stripe_invoice_id, stripe_checkout_session_id, stripe_subscription_id, sucursales(nombre)"


def _firma(pago_id: str, vence: int) -> str:
  return hmac.new(SECRETO, f"{pago_id}.{vence}".encode(), hashlib.sha256).hexdigest()[:32]


def _vista(p: dict) -> dict:
  return {
    "id": p["id"], "folio": p.get("folio"), "concepto": p.get("concepto") or "Pago", "monto": p.get("monto"),
    "metodo": p.get("metodo_pago"), "fecha": p.get("fecha_pago"), "estatus": p.get("estatus"),
    "sucursal": (p.get("sucursales") or {}).get("nombre"), "canal": p.get("canal"),
    "tipo": "renovacion" if "renovaci" in (p.get("concepto") or "").lower() else
            "galley" if (p.get("metadata") or {}).get("venta_id") else
            "penalizacion" if "no show" in (p.get("concepto") or "").lower() else "compra",
  }


def _membresia_del_pago(p: dict, cliente_id: str) -> dict | None:
  """El plan que se compró con este pago (mismo paquete, creado el mismo día o un día después)."""
  paquete_id = (p.get("metadata") or {}).get("paquete_id")
  if not paquete_id or not p.get("fecha_pago"):
    return None
  f = datetime.fromisoformat(str(p["fecha_pago"]).replace("Z", "+00:00"))
  m = supabase.table("membresias").select("fecha_inicio, fecha_fin, activacion_pendiente, paquetes(nombre, vigencia_dias, clases_incluidas)")\
    .eq("cliente_id", cliente_id).eq("paquete_id", paquete_id)\
    .gte("created_at", (f - timedelta(hours=2)).isoformat()).lte("created_at", (f + timedelta(days=1)).isoformat())\
    .order("created_at").limit(1).execute().data
  return m[0] if m else None


# ── Historial y detalle ───────────────────────────────────────────────────────
@router.get("")
async def mis_pagos(request: Request):
  cli = _cliente(request)
  filas = supabase.table("pagos").select(SEL).eq("cliente_id", cli["id"])\
    .order("fecha_pago", desc=True).limit(200).execute().data or []
  return {"pagos": [_vista(p) for p in filas]}


@router.get("/tarjeta/estado")
async def estado_tarjeta(request: Request):
  """Para los avisos de la app: ¿tiene tarjeta?, ¿cuándo vence su plan?, ¿puede activar renovación automática?"""
  cli = _cliente(request)
  ficha = supabase.table("clientes").select("tarjeta_guardada, tarjeta_marca, tarjeta_ultimos4, created_at, stripe_customer_id")\
    .eq("id", cli["id"]).single().execute().data
  if ficha.get("stripe_customer_id") and not ficha.get("tarjeta_guardada"):
    t = actualizar_tarjeta(cli["id"])                 # por si la agregó y la ficha no se había enterado
    if t:
      ficha.update({"tarjeta_guardada": True, "tarjeta_marca": t["marca"], "tarjeta_ultimos4": t["ultimos4"]})

  hoy = datetime.now(CDMX).date().isoformat()
  memb = supabase.table("membresias").select("id, fecha_fin, activacion_pendiente, stripe_subscription_id, renovacion_cancelada, origen, paquetes(id, nombre, es_recurrente)")\
    .eq("cliente_id", cli["id"]).eq("estatus", "Activa").or_(f"activacion_pendiente.eq.true,fecha_fin.gte.{hoy}")\
    .order("fecha_fin", desc=True).limit(1).execute().data
  m = memb[0] if memb else None
  dias = (date.fromisoformat(m["fecha_fin"]) - date.fromisoformat(hoy)).days if m and m.get("fecha_fin") and not m.get("activacion_pendiente") else None
  return {
    "tiene_tarjeta": bool(ficha.get("tarjeta_guardada")), "marca": ficha.get("tarjeta_marca"), "ultimos4": ficha.get("tarjeta_ultimos4"),
    "cuenta_nueva": (datetime.now(timezone.utc) - datetime.fromisoformat(ficha["created_at"].replace("Z", "+00:00"))).days < 3,
    "plan": (m.get("paquetes") or {}).get("nombre") if m else None,
    "plan_vence": m.get("fecha_fin") if m else None, "dias_para_vencer": dias,
    "puede_renovar_auto": bool(m and (m.get("paquetes") or {}).get("es_recurrente") and not m.get("stripe_subscription_id")
                               and "migr" not in (m.get("origen") or "").lower()),
  }


@router.post("/tarjeta/renovacion-automatica")
async def activar_renovacion(request: Request):
  """Programa el cobro del mismo plan para el día que vence (con su tarjeta guardada)."""
  cli = _cliente(request)
  est = await estado_tarjeta(request)
  if not est["tiene_tarjeta"]:
    raise HTTPException(status_code=400, detail="Primero agrega tu tarjeta.")
  if not est["puede_renovar_auto"]:
    raise HTTPException(status_code=400, detail="Tu plan actual no tiene renovación automática.")
  memb = supabase.table("membresias").select("id, paquete_id").eq("cliente_id", cli["id"]).eq("estatus", "Activa")\
    .order("fecha_fin", desc=True).limit(1).execute().data[0]
  try:
    c = ss._preparar_compra(cli["id"], memb["paquete_id"], None, "renovacion_app")
  except ValueError as e:
    raise HTTPException(status_code=400, detail=str(e))
  inicio = ss._trial_end(c["memb"])
  if not inicio:
    raise HTTPException(status_code=400, detail="Tu plan termina muy pronto: renuévalo desde Comprar plan.")
  from services.tarjetas import tarjeta_de
  t = tarjeta_de(cli["id"])
  sub = ss.crear_suscripcion(c["customer"], c["paq"], c["monto"], c["meta"],
                             default_payment_method=t["id"], trial_end=inicio, payment_behavior="default_incomplete")
  supabase.table("clientes").update({"stripe_subscription_id": sub.id}).eq("id", cli["id"]).execute()
  supabase.table("membresias").update({"stripe_subscription_id": sub.id, "renovacion_cancelada": False}).eq("id", memb["id"]).execute()
  fecha = datetime.fromtimestamp(inicio, CDMX).strftime("%d/%m/%Y")
  return {"ok": True, "fecha": fecha, "monto": c["monto"], "plan": c["paq"]["nombre"]}


@router.get("/{pago_id}")
async def detalle(pago_id: str, request: Request):
  cli = _cliente(request)
  p = supabase.table("pagos").select(SEL).eq("id", pago_id).eq("cliente_id", cli["id"]).limit(1).execute().data
  if not p:
    raise HTTPException(status_code=404, detail="Pago no encontrado")
  p = p[0]
  out = _vista(p)
  out["receipt_url"] = p.get("receipt_url")
  m = _membresia_del_pago(p, cli["id"])
  if m:
    paq = m.get("paquetes") or {}
    out["plan"] = {"nombre": paq.get("nombre"), "inicio": m.get("fecha_inicio"), "fin": m.get("fecha_fin"),
                   "pendiente": m.get("activacion_pendiente"), "clases": paq.get("clases_incluidas"), "dias": paq.get("vigencia_dias")}
  venta_id = (p.get("metadata") or {}).get("venta_id")
  if venta_id:
    items = supabase.table("venta_items").select("cantidad, precio_unitario, productos(nombre)").eq("venta_id", venta_id).execute().data or []
    out["productos"] = [{"nombre": (i.get("productos") or {}).get("nombre"), "cantidad": i["cantidad"], "precio": i["precio_unitario"]} for i in items]
  return out


# ── Comprobante PDF (enlace firmado de 15 min, para abrirlo en el navegador del celular) ──
@router.post("/{pago_id}/enlace-comprobante")
async def enlace(pago_id: str, request: Request):
  cli = _cliente(request)
  if not supabase.table("pagos").select("id").eq("id", pago_id).eq("cliente_id", cli["id"]).limit(1).execute().data:
    raise HTTPException(status_code=404, detail="Pago no encontrado")
  vence = int(time.time()) + 900
  return {"url": f"{BACKEND}/mis-pagos/{pago_id}/comprobante.pdf?v={vence}&f={_firma(pago_id, vence)}"}


@router.get("/{pago_id}/comprobante.pdf")
async def pdf(pago_id: str, v: int, f: str):
  if v < time.time() or not hmac.compare_digest(f, _firma(pago_id, v)):
    raise HTTPException(status_code=403, detail="El enlace venció. Vuelve a abrir el comprobante desde la app.")
  p = supabase.table("pagos").select(SEL + ", cliente_id").eq("id", pago_id).single().execute().data
  cli = supabase.table("clientes").select("nombre_completo, email").eq("id", p["cliente_id"]).single().execute().data
  m = _membresia_del_pago(p, p["cliente_id"])
  dmy = lambda d: f"{d[8:10]}/{d[5:7]}/{d[0:4]}"
  vig = f"{dmy(m['fecha_inicio'])} al {dmy(m['fecha_fin'])}" if m and m.get("fecha_inicio") and not m.get("activacion_pendiente") else \
        ("Empieza con tu primera reserva" if m else None)
  contenido = comprobante_pdf(p, cli, (p.get("sucursales") or {}).get("nombre"), {"vigencia": vig})
  return Response(contenido, media_type="application/pdf",
                  headers={"Content-Disposition": f'inline; filename="Comprobante-{p.get("folio") or "Navy"}.pdf"'})