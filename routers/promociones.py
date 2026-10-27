# routers/promociones.py  →  prefijo /promociones
# Dirección crea y maneja promociones; la app y el CRM consultan precios con promoción.
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from services.supabase import supabase
from services.auth_app import staff_de_sesion
from services import promociones as P
from services.stripe_service import precio_paquete

router = APIRouter()
CAMPOS = ("nombre", "mensaje", "tipo", "valor", "duracion", "meses", "audiencia", "sucursales", "inicia", "termina", "usos_maximos", "activa")


def _limpiar(b: dict) -> dict:
  d = {k: b.get(k) for k in CAMPOS if k in b}
  if d.get("tipo") not in (None, "porcentaje", "monto", "precio_especial"): raise HTTPException(400, "Tipo de descuento inválido")
  if d.get("tipo") == "porcentaje" and not (0 < float(d.get("valor") or 0) <= 100): raise HTTPException(400, "El porcentaje va de 1 a 100")
  if d.get("duracion") == "meses" and not d.get("meses"): raise HTTPException(400, "Indica cuántos meses dura el descuento")
  if d.get("duracion") != "meses": d["meses"] = None
  if not d.get("sucursales"): d["sucursales"] = None
  for k in ("inicia", "termina", "usos_maximos"):
    if d.get(k) in ("", 0): d[k] = None
  if not (d.get("nombre") or "").strip(): raise HTTPException(400, "Ponle un nombre a la promoción")
  return d


def _guardar_items(pid: str, items: list[dict]):
  supabase.table("promocion_items").delete().eq("promocion_id", pid).execute()
  filas = [{"promocion_id": pid, "item_tipo": i["tipo"], "item_id": i["id"]} for i in items if i.get("id") and i.get("tipo") in ("paquete", "producto")]
  for i in range(0, len(filas), 200):
    supabase.table("promocion_items").insert(filas[i:i + 200]).execute()


# ── Dirección ─────────────────────────────────────────────────────────────────
@router.get("")
async def lista(request: Request):
  staff_de_sesion(request, roles=["direccion"])
  promos = supabase.table("promociones").select("*").order("created_at", desc=True).execute().data or []
  items = supabase.table("promocion_items").select("promocion_id, item_tipo, item_id").execute().data or []
  usos = supabase.table("promocion_usos").select("promocion_id, precio_original, precio_final").eq("estatus", "aplicado").execute().data or []
  ahora = datetime.now(timezone.utc).isoformat()
  for p in promos:
    p["items"] = [{"tipo": i["item_tipo"], "id": i["item_id"]} for i in items if i["promocion_id"] == p["id"]]
    mios = [u for u in usos if u["promocion_id"] == p["id"]]
    p["usos"] = len(mios)
    p["descontado"] = round(sum(float(u["precio_original"] or 0) - float(u["precio_final"] or 0) for u in mios), 2)
    p["vendido"] = round(sum(float(u["precio_final"] or 0) for u in mios), 2)
    p["estado"] = ("Apagada" if not p["activa"] else "Programada" if p.get("inicia") and p["inicia"] > ahora
                   else "Terminada" if p.get("termina") and p["termina"] < ahora
                   else "Agotada" if p.get("usos_maximos") and p["usos"] >= p["usos_maximos"] else "Activa")
  return {"promociones": promos}


@router.get("/catalogo")
async def catalogo(request: Request):
  """Todo lo que se puede poner en promoción: paquetes (con su precio por sucursal) y productos de The Galley."""
  staff_de_sesion(request, roles=["direccion"])
  paquetes = supabase.table("paquetes").select("id, nombre, precio, es_recurrente, vigencia_dias, clases_incluidas, estatus").execute().data or []
  precios = supabase.table("paquete_precios").select("paquete_id, sucursal_id, precio_app").execute().data or []
  for p in paquetes:
    p["precios"] = {x["sucursal_id"]: x["precio_app"] for x in precios if x["paquete_id"] == p["id"] and x.get("precio_app")}
  try:
    productos = supabase.table("productos").select("*").execute().data or []
  except Exception:
    productos = []
  sucursales = supabase.table("sucursales").select("id, nombre").order("nombre").execute().data or []
  return {"paquetes": [p for p in paquetes if (p.get("estatus") or "Activo") == "Activo" and "retirado" not in (p["nombre"] or "").lower()],
          "productos": [{"id": x["id"], "nombre": x.get("nombre"), "precio": x.get("precio") or x.get("precio_venta"),
                         "categoria": x.get("categoria"), "sucursal_id": x.get("sucursal_id")}
                        for x in productos if x.get("activo", True) is not False],
          "sucursales": sucursales}


@router.post("")
async def crear(request: Request):
  staff = staff_de_sesion(request, roles=["direccion"])
  b = await request.json()
  d = _limpiar(b)
  d["creada_por"] = staff.get("id")
  p = supabase.table("promociones").insert(d).execute().data[0]
  _guardar_items(p["id"], b.get("items") or [])
  return {"ok": True, "id": p["id"]}


@router.put("/{pid}")
async def editar(pid: str, request: Request):
  staff_de_sesion(request, roles=["direccion"])
  b = await request.json()
  d = _limpiar(b)
  d["updated_at"] = datetime.now(timezone.utc).isoformat()
  supabase.table("promociones").update(d).eq("id", pid).execute()
  if "items" in b:
    _guardar_items(pid, b["items"])
  return {"ok": True}


@router.post("/{pid}/activa")
async def prender_apagar(pid: str, request: Request):
  staff_de_sesion(request, roles=["direccion"])
  activa = bool((await request.json()).get("activa"))
  supabase.table("promociones").update({"activa": activa, "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", pid).execute()
  return {"ok": True, "activa": activa}


@router.post("/{pid}/notificar")
async def notificar(pid: str, request: Request):
  """Notificación a los clientes de las sucursales de la promoción (y de su público: todos, nuevos o staff)."""
  staff_de_sesion(request, roles=["direccion"])
  b = await request.json()
  p = supabase.table("promociones").select("*").eq("id", pid).single().execute().data
  titulo, texto = (b.get("titulo") or "").strip(), (b.get("texto") or "").strip()
  if not titulo or not texto:
    raise HTTPException(400, "Escribe el título y el texto de la notificación")
  q = supabase.table("clientes").select("id, es_staff").not_.is_("supabase_user_id", "null")
  if p.get("sucursales"):
    q = q.in_("sucursal_id", p["sucursales"])
  clientes = q.execute().data or []
  if p["audiencia"] == "staff":
    clientes = [c for c in clientes if c.get("es_staff")]
  elif p["audiencia"] == "nuevos":
    pagaron = {x["cliente_id"] for x in (supabase.table("pagos").select("cliente_id").eq("estatus", "Completado").gt("monto", 0).execute().data or [])}
    clientes = [c for c in clientes if c["id"] not in pagaron]
  from services.stripe_activacion import push_cliente
  enviados = 0
  for c in clientes:
    try:
      await push_cliente(c["id"], titulo, texto, {"tipo": "promocion", "promocion_id": pid})
      enviados += 1
    except Exception as e:
      print("promoción push:", e)
  return {"ok": True, "enviados": enviados}


# ── App y CRM: precios con promoción ──────────────────────────────────────────
@router.post("/precios")
async def precios(request: Request):
  """Body: {cliente_id?, sucursal_id, items: [{tipo, id, precio?}]} → el precio con promoción de cada uno."""
  b = await request.json()
  suc, cid = b.get("sucursal_id"), b.get("cliente_id")
  cache, out = {}, {}
  for it in b.get("items") or []:
    tipo, iid = it.get("tipo"), it.get("id")
    if tipo == "paquete":
      paq = supabase.table("paquetes").select("id, precio, es_recurrente").eq("id", iid).limit(1).execute().data
      if not paq: continue
      base = float(it.get("precio") or precio_paquete(paq[0], suc) or 0)
      promo = P.mejor_promocion(cid, "paquete", iid, suc, base, recurrente=bool(paq[0].get("es_recurrente")), _cache=cache)
    else:
      base = float(it.get("precio") or 0)
      promo = P.mejor_promocion(cid, "producto", iid, suc, base, _cache=cache)
    if promo:
      out[iid] = {k: promo[k] for k in ("precio_original", "precio_final", "descuento", "texto", "duracion", "meses", "promocion_id")}
  return {"precios": out}


@router.post("/uso-venta")
async def uso_venta(request: Request):
  """The Galley: registra qué promociones se usaron en una venta (para los reportes)."""
  staff_de_sesion(request)
  b = await request.json()
  for it in b.get("items") or []:
    if it.get("promocion_id"):
      P.registrar_uso({"promocion_id": it["promocion_id"], "precio_original": it.get("precio_original"), "precio_final": it.get("precio_final")},
                      b.get("cliente_id"), "producto", it.get("producto_id"), "galley", aplicado=True, venta_id=b.get("venta_id"))
  return {"ok": True}