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


def calcular(cliente: dict, membresias: list[dict], hoy: str | None = None) -> dict:
  """Qué deberían decir plan, paquete_id, fecha_venc_plan y estatus de este cliente.
  Regla (en orden):
    1. Con plan vigente, en espera de su primera reserva o en cola  → Activo, con el plan que se muestra:
         primero el que pagó (no la carga masiva), luego el que ya corre, luego el que vence más tarde,
         y en empate el de mayor precio. El vencimiento es el último día que tiene cubierto.
    2. Usuario de Wellhub/TotalPass sin plan de Navy                → su plataforma (estado sin cambio).
    3. Su último plan ya terminó                                   → Vencido (si estaba Inactivo o Perdido, se respeta).
    4. Nunca ha tenido plan                                         → sin cambios (prospecto).
  """
  hoy = hoy or _hoy()
  vigentes = [m for m in membresias
              if m.get("estatus") == "Activa" and (m.get("activacion_pendiente") or (m.get("fecha_fin") or "") >= hoy)]

  if vigentes:
    vigentes.sort(key=lambda m: (
      _es_migracion(m),                                   # False (pagó) antes que True (carga masiva)
      not ((m.get("fecha_inicio") or "") <= hoy),          # el que ya corre antes que el que está en cola
      _neg_fecha(m.get("fecha_fin")),                      # el que vence más tarde primero
      -float(m.get("precio_pagado") or 0),                 # el de mayor precio primero
    ))
    m = vigentes[0]
    # El vencimiento sale de los planes que pagó; la carga masiva solo cuenta si no tiene otro
    cuentan = [v for v in vigentes if not _es_migracion(v)] or vigentes
    return {
      "plan":            (m.get("paquetes") or {}).get("nombre"),
      "paquete_id":      m.get("paquete_id"),
      "fecha_venc_plan": max((v.get("fecha_fin") or "") for v in cuentan) or None,
      "estatus":         "Activo",
    }

  if cliente.get("origen") in PLATAFORMAS:
    return {"plan": cliente["origen"], "paquete_id": None}

  pasadas = [m for m in membresias if m.get("estatus") != "Cancelada" and m.get("fecha_fin")]
  if pasadas:
    ult = max(pasadas, key=lambda m: m["fecha_fin"])
    estatus = cliente.get("estatus")
    return {
      "plan":            (ult.get("paquetes") or {}).get("nombre"),
      "paquete_id":      ult.get("paquete_id"),
      "fecha_venc_plan": ult["fecha_fin"],
      "estatus":         estatus if (estatus == "Inactivo" or cliente.get("perdido")) else "Vencido",
    }
  # Ningún plan (por ejemplo, se le cancelaron todos): la ficha queda limpia
  return {"plan": None, "paquete_id": None, "fecha_venc_plan": None,
          "estatus": cliente.get("estatus") if cliente.get("estatus") in ("Inactivo", "Prospecto") else "Inactivo"}


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
  """Para todos los clientes con membresías. Corre cada hora y a medianoche."""
  hoy = _hoy()
  # 1. Membresías que terminaron (y no esperan su primera reserva) pasan a Vencida
  try:
    supabase.table("membresias").update({"estatus": "Vencida"})\
      .eq("estatus", "Activa").lt("fecha_fin", hoy).neq("activacion_pendiente", True).execute()
  except Exception as e:
    print("estado_clientes vencer:", e)

  # 2. Recalcular a cada cliente
  por_cliente: dict[str, list] = {}
  for m in _todo("membresias", SEL_MEMB):
    if m.get("cliente_id"):
      por_cliente.setdefault(m["cliente_id"], []).append(m)
  clientes = {c["id"]: c for c in _todo("clientes", SEL_CLI)}

  actualizados = 0
  for cid, membs in por_cliente.items():
    cli = clientes.get(cid)
    if not cli:
      continue
    cambios = _cambios(cli, calcular(cli, membs, hoy))
    if cambios:
      try:
        supabase.table("clientes").update(cambios).eq("id", cid).execute()
        actualizados += 1
      except Exception as e:
        print(f"estado_clientes {cid}:", e)
  print(f"🔄 Estado de clientes: {actualizados} actualizados de {len(por_cliente)}")
  return {"revisados": len(por_cliente), "actualizados": actualizados}