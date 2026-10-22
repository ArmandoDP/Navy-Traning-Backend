# services/estado_clientes.py
# Plan, vencimiento y estado de cada cliente, calculados SIEMPRE desde sus membresías.
# La tabla de clientes del CRM solo lee lo que este servicio guarda en la ficha del cliente.
from datetime import date, datetime, timedelta, timezone
from services.supabase import supabase

CDMX = timezone(timedelta(hours=-6))
PLATAFORMAS = {"Wellhub", "TotalPass"}


def _hoy() -> str:
  return datetime.now(CDMX).date().isoformat()


def _es_migracion(m: dict) -> bool:
  return "migr" in (m.get("origen") or "").lower()


DIAS_HASTA_INACTIVO = 60      # después de este tiempo sin plan, "Se le venció" pasa a "Ya no viene"


def _es_clase_suelta(m: dict) -> bool:
  n = ((m.get("paquetes") or {}).get("nombre") or "").lower()
  return any(x in n for x in ("one class", "clase muestra", "clase suelta", "clase de prueba"))


def calcular(cliente: dict, membresias: list[dict], hoy: str | None = None) -> dict:
  """Plan, vencimiento y estado de un cliente, SIEMPRE desde sus membresías.
  Estados que se guardan (el CRM los muestra con nombres claros):
    Activo      → tiene un plan vigente, en pausa, en cola o esperando su 1ª reserva
    Plataforma  → solo viene por Wellhub/TotalPass y nunca ha tenido plan de Navy
    Vencido     → su último plan terminó hace 60 días o menos
    Inactivo    → su último plan terminó hace más de 60 días
    Prospecto   → nunca ha comprado un plan (registro en app, clase muestra o clase suelta)
  La marca "perdido" (dado de baja a mano) es aparte y no se toca aquí.
  """
  hoy = hoy or _hoy()
  validas = [m for m in membresias if m.get("estatus") != "Cancelada"]
  planes = [m for m in validas if not _es_clase_suelta(m)]

  vigentes = [m for m in planes
              if m.get("estatus") in ("Activa", "Pausada") and (m.get("activacion_pendiente") or (m.get("fecha_fin") or "") >= hoy)]
  if vigentes:
    vigentes.sort(key=lambda m: (
      _es_migracion(m),                                   # el que pagó antes que el de la carga masiva
      not ((m.get("fecha_inicio") or "") <= hoy),          # el que ya corre antes que el que está en cola
      _neg_fecha(m.get("fecha_fin")),                      # el que vence más tarde primero
      -float(m.get("precio_pagado") or 0),                 # el de mayor precio primero
    ))
    m = vigentes[0]
    cuentan = [v for v in vigentes if not _es_migracion(v)] or vigentes
    pendiente = all(v.get("activacion_pendiente") for v in vigentes)
    return {
      "plan":            (m.get("paquetes") or {}).get("nombre"),
      "paquete_id":      m.get("paquete_id"),
      "fecha_venc_plan": None if pendiente else (max((v.get("fecha_fin") or "") for v in cuentan) or None),
      "estatus":         "Activo",
    }

  pasados = [m for m in planes if m.get("fecha_fin")]
  if pasados:
    ult = max(pasados, key=lambda m: m["fecha_fin"])
    dias = (date.fromisoformat(hoy) - date.fromisoformat(ult["fecha_fin"][:10])).days
    return {
      "plan":            (ult.get("paquetes") or {}).get("nombre"),
      "paquete_id":      ult.get("paquete_id"),
      "fecha_venc_plan": ult["fecha_fin"][:10],
      "estatus":         "Vencido" if dias <= DIAS_HASTA_INACTIVO else "Inactivo",
    }

  if cliente.get("origen") in PLATAFORMAS:
    return {"plan": cliente["origen"], "paquete_id": None, "fecha_venc_plan": None, "estatus": "Plataforma"}

  # Nunca ha comprado un plan (puede tener una clase suelta)
  sueltas = sorted([m for m in validas if _es_clase_suelta(m)], key=lambda m: m.get("fecha_inicio") or "")
  return {"plan": (sueltas[-1].get("paquetes") or {}).get("nombre") if sueltas else None,
          "paquete_id": sueltas[-1].get("paquete_id") if sueltas else None,
          "fecha_venc_plan": None, "estatus": "Prospecto"}


def _neg_fecha(f: str | None) -> int:
  try:
    return -date.fromisoformat((f or "1900-01-01")[:10]).toordinal()
  except ValueError:
    return 0


def _cambios(cliente: dict, nuevo: dict) -> dict:
  cambios = {k: v for k, v in nuevo.items() if (cliente.get(k) or None) != (v or None)}
  # Columnas viejas que todavía leen algunas pantallas: siempre iguales a las nuevas
  if "plan" in nuevo and (cliente.get("nombre_plan") or None) != (nuevo["plan"] or None):
    cambios["nombre_plan"] = nuevo["plan"]
  if "fecha_venc_plan" in cambios:
    cambios["fecha_vencimiento_membresia"] = cambios["fecha_venc_plan"]
  return cambios


SEL_MEMB = "cliente_id, estatus, fecha_inicio, fecha_fin, activacion_pendiente, origen, precio_pagado, paquete_id, paquetes(nombre)"
SEL_CLI  = "id, origen, estatus, plan, nombre_plan, paquete_id, fecha_venc_plan, perdido"


def sincronizar_cliente(cliente_id: str) -> dict:
  """Recalcula un cliente. Se llama después de cualquier cambio en sus membresías."""
  if not cliente_id:
    return {}
  try:
    cli = supabase.table("clientes").select(SEL_CLI).eq("id", cliente_id).limit(1).execute().data
    if not cli:
      return {}
    membs = supabase.table("membresias").select(SEL_MEMB).eq("cliente_id", cliente_id).execute().data or []
    cambios = _cambios(cli[0], calcular(cli[0], membs))
    if cambios:
      supabase.table("clientes").update(cambios).eq("id", cliente_id).execute()
    return cambios
  except Exception as e:
    print(f"estado_clientes {cliente_id}:", e)
    return {}


def _todo(tabla: str, select: str) -> list[dict]:
  filas, desde = [], 0
  while True:
    lote = supabase.table(tabla).select(select).range(desde, desde + 999).execute().data or []
    filas += lote
    if len(lote) < 1000:
      return filas
    desde += 1000


async def sincronizar_todos() -> dict:
  """Para todos los clientes. Corre cada hora y a medianoche."""
  hoy = _hoy()
  # 1. Membresías que terminaron (y no esperan su primera reserva) pasan a Vencida
  try:
    supabase.table("membresias").update({"estatus": "Vencida"})\
      .eq("estatus", "Activa").lt("fecha_fin", hoy).neq("activacion_pendiente", True).execute()
  except Exception as e:
    print("estado_clientes vencer:", e)

  # 2. Recalcular a TODOS los clientes (también a los que nunca han tenido plan)
  por_cliente: dict[str, list] = {}
  for m in _todo("membresias", SEL_MEMB):
    if m.get("cliente_id"):
      por_cliente.setdefault(m["cliente_id"], []).append(m)
  clientes = _todo("clientes", SEL_CLI)

  actualizados = 0
  for cli in clientes:
    cambios = _cambios(cli, calcular(cli, por_cliente.get(cli["id"], []), hoy))
    if cambios:
      try:
        supabase.table("clientes").update(cambios).eq("id", cli["id"]).execute()
        actualizados += 1
      except Exception as e:
        print(f"estado_clientes {cli['id']}:", e)
  print(f"🔄 Estado de clientes: {actualizados} actualizados de {len(clientes)}")
  return {"revisados": len(clientes), "actualizados": actualizados}