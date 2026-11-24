"""
routers/staff_admin.py — Datos del módulo de Staff que salen del checador y de tablas protegidas.
Solo Dirección y Managers (rol "gerente"). Un Manager solo ve al staff de sus sucursales.

  GET  /staff-admin/equipo?sucursal_id=     quién está adentro, días/horas y clases de la quincena por persona
  GET  /staff-admin/perfil/{staff_id}       resumen de la quincena, clases, checadas y datos bancarios
  PUT  /staff-admin/banco/{staff_id}        guardar banco y CLABE (solo Dirección)

Registrar en main.py:
  from routers.staff_admin import router as staff_admin_router
  app.include_router(staff_admin_router, prefix="/staff-admin")
"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from services.supabase import supabase
from routers.checador import (
  _staff, _es_admin, _sucursales_de, _quincena, _quincena_staff, _horario_semana,
  _ahora, _dt, CDMX,
)

router = APIRouter()


# ── Permisos ──────────────────────────────────────────────────────────────────
def _admin(request: Request) -> dict:
  s = _staff(request)
  if not (_es_admin(s) or (s.get("rol") or "").lower() == "gerente"):
    raise HTTPException(status_code=403, detail="El módulo de Staff es solo para Dirección y Managers.")
  return s


def _es_direccion(s: dict) -> bool:
  return _es_admin(s)


def _sucursales_staff(staff_id: str) -> set[str]:
  ids = {x["sucursal_id"] for x in supabase.table("staff_sucursales").select("sucursal_id")
         .eq("staff_id", staff_id).execute().data or []}
  fila = supabase.table("staff").select("sucursal_asignada_id").eq("id", staff_id).limit(1).execute().data
  if fila and fila[0].get("sucursal_asignada_id"):
    ids.add(fila[0]["sucursal_asignada_id"])
  return ids


def _puede_ver(s: dict, staff_id: str):
  """Un Manager solo ve a quien comparte al menos una sucursal con él."""
  if _es_direccion(s):
    return
  if not (_sucursales_staff(staff_id) & _sucursales_de(s)):
    raise HTTPException(status_code=403, detail="Esta persona no es de tus sucursales.")


def _alcance(s: dict, sucursal_id: str | None) -> set[str] | None:
  """Sucursales a considerar. None = todas (solo Dirección en vista Global)."""
  if sucursal_id:
    if not _es_direccion(s) and sucursal_id not in _sucursales_de(s):
      raise HTTPException(status_code=403, detail="No tienes acceso a esa sucursal.")
    return {sucursal_id}
  return None if _es_direccion(s) else _sucursales_de(s)


def _es_open_gym(nombre: str | None) -> bool:
  return "open gym" in (nombre or "").lower()


# ── Equipo ────────────────────────────────────────────────────────────────────
@router.get("/equipo")
async def equipo(request: Request, sucursal_id: str | None = None):
  s = _admin(request)
  alcance = _alcance(s, sucursal_id)
  ini_q, fin_q = _quincena()
  ahora = _ahora()
  hoy = ahora.astimezone(CDMX).date()

  # Checadas de la quincena → adentro ahora, días y horas
  q = supabase.table("checadas").select("staff_id, tipo, estado, registrado_at, sucursal_id")\
    .gte("registrado_at", ini_q.isoformat()).lt("registrado_at", fin_q.isoformat())\
    .neq("estado", "rechazada").order("registrado_at").limit(10000)
  if alcance is not None:
    q = q.in_("sucursal_id", list(alcance))
  checadas = q.execute().data or []

  personas: dict[str, dict] = {}
  abiertas: dict[str, datetime] = {}
  for c in checadas:
    p = personas.setdefault(c["staff_id"], {"dias": set(), "minutos": 0.0, "adentro_desde": None,
                                            "programadas": 0, "impartidas": 0, "sin_checar": 0})
    t = _dt(c["registrado_at"])
    if c["tipo"] == "entrada" and c["estado"] in ("confirmada", "automatica", "manual"):
      abiertas[c["staff_id"]] = t
      p["dias"].add(t.astimezone(CDMX).date())
    elif c["tipo"] == "salida" and c["staff_id"] in abiertas:
      p["minutos"] += (t - abiertas.pop(c["staff_id"])).total_seconds() / 60
  for sid, t in abiertas.items():
    if t.astimezone(CDMX).date() == hoy:
      personas[sid]["adentro_desde"] = t.isoformat()
      personas[sid]["minutos"] += (ahora - t).total_seconds() / 60

  # Clases de la quincena por coach (programadas e impartidas/sin checar)
  qc = supabase.table("clases").select("id, coach_id, nombre_clase, horario")\
    .gte("horario", ini_q.isoformat()).lt("horario", fin_q.isoformat())\
    .neq("estado", "Cancelada").not_.is_("coach_id", "null").limit(10000)
  if alcance is not None:
    qc = qc.in_("sucursal_id", list(alcance))
  clases = [c for c in (qc.execute().data or []) if not _es_open_gym(c.get("nombre_clase"))]
  ids_clase = {c["id"] for c in clases}
  for c in clases:
    p = personas.setdefault(c["coach_id"], {"dias": set(), "minutos": 0.0, "adentro_desde": None,
                                            "programadas": 0, "impartidas": 0, "sin_checar": 0})
    p["programadas"] += 1

  imp = supabase.table("clases_impartidas").select("clase_id, coach_id, estado")\
    .gte("horario", ini_q.isoformat()).lt("horario", fin_q.isoformat()).limit(10000).execute().data or []
  for i in imp:
    if i["clase_id"] not in ids_clase or i["coach_id"] not in personas:
      continue
    if i["estado"] == "impartida":
      personas[i["coach_id"]]["impartidas"] += 1
    elif i["estado"] in ("sin_checar", "revisar"):
      personas[i["coach_id"]]["sin_checar"] += 1

  return {
    "quincena": {"inicio": ini_q.isoformat(), "fin": fin_q.isoformat()},
    "personas": {sid: {"dias": len(p["dias"]), "horas": round(p["minutos"] / 60, 1),
                       "adentro_desde": p["adentro_desde"], "programadas": p["programadas"],
                       "impartidas": p["impartidas"], "sin_checar": p["sin_checar"]}
                 for sid, p in personas.items()},
  }


# ── Perfil ────────────────────────────────────────────────────────────────────
def _banco(staff_id: str, completo: bool) -> dict | None:
  fila = supabase.table("staff_datos_bancarios").select("banco, clabe, titular, updated_at")\
    .eq("staff_id", staff_id).limit(1).execute().data
  if not fila:
    return None
  b = fila[0]
  clabe = (b.get("clabe") or "").replace(" ", "")
  return {
    "banco": b.get("banco"),
    "titular": b.get("titular") if completo else None,
    "clabe": clabe if completo else None,
    "clabe_mascara": f"•••• {clabe[-4:]}" if clabe else None,
    "completo": completo,
    "updated_at": b.get("updated_at"),
  }


@router.get("/perfil/{staff_id}")
async def perfil(staff_id: str, request: Request):
  s = _admin(request)
  _puede_ver(s, staff_id)
  ini_q, fin_q = _quincena()
  ahora = _ahora()

  st = supabase.table("staff").select("id, tipo, tipo_pago, sucursal_asignada_id")\
    .eq("id", staff_id).limit(1).execute().data
  if not st:
    raise HTTPException(status_code=404, detail="No existe esa persona.")
  st = st[0]

  # Clases de la quincena (las que dio o va a dar)
  clases = supabase.table("clases")\
    .select("id, nombre_clase, horario, duracion_minutos, capacidad_max, estado, sucursales(nombre)")\
    .eq("coach_id", staff_id).gte("horario", ini_q.isoformat()).lt("horario", fin_q.isoformat())\
    .neq("estado", "Cancelada").order("horario", desc=True).limit(300).execute().data or []
  clases = [c for c in clases if not _es_open_gym(c.get("nombre_clase"))]
  ids = [c["id"] for c in clases]
  estados, llegaron, reservas = {}, {}, {}
  if ids:
    for i in supabase.table("clases_impartidas").select("clase_id, estado").in_("clase_id", ids).execute().data or []:
      estados[i["clase_id"]] = i["estado"]
    for a in supabase.table("asistencias").select("clase_id").in_("clase_id", ids).limit(10000).execute().data or []:
      llegaron[a["clase_id"]] = llegaron.get(a["clase_id"], 0) + 1
    for r in supabase.table("reservas").select("clase_id").in_("clase_id", ids)\
        .neq("estatus", "Cancelada").eq("lista_espera", False).limit(10000).execute().data or []:
      reservas[r["clase_id"]] = reservas.get(r["clase_id"], 0) + 1

  lista = []
  for c in clases:
    inicio = _dt(c["horario"])
    fin = inicio + timedelta(minutes=c.get("duracion_minutos") or 60)
    est = estados.get(c["id"])
    if not est:
      est = "por_dar" if inicio > ahora else ("en_curso" if fin > ahora else "pendiente")
    lista.append({
      "id": c["id"], "nombre": (c.get("nombre_clase") or "").strip(), "horario": c["horario"],
      "duracion": c.get("duracion_minutos") or 60, "sucursal": (c.get("sucursales") or {}).get("nombre"),
      "cupo": c.get("capacidad_max") or 0, "reservas": reservas.get(c["id"], 0),
      "llegaron": llegaron.get(c["id"], 0), "estado": est,
    })

  # Checadas de los últimos 30 días
  checadas = supabase.table("checadas")\
    .select("id, tipo, estado, registrado_at, motivo, distancia_m, sucursales(nombre)")\
    .eq("staff_id", staff_id).gte("registrado_at", (ahora - timedelta(days=30)).isoformat())\
    .order("registrado_at", desc=True).limit(200).execute().data or []

  impartidas = sum(1 for c in lista if c["estado"] == "impartida")
  con_llegada = [c["llegaron"] for c in lista if c["estado"] == "impartida"]
  horario = _horario_semana(staff_id, st["sucursal_asignada_id"]) if st.get("sucursal_asignada_id") else None

  return {
    "quincena": {"inicio": ini_q.isoformat(), "fin": fin_q.isoformat()},
    "resumen": {
      "clases_programadas": len(lista),
      "clases_impartidas": impartidas,
      "sin_checar": sum(1 for c in lista if c["estado"] in ("sin_checar", "revisar")),
      "asistentes_promedio": round(sum(con_llegada) / len(con_llegada), 1) if con_llegada else None,
      **_quincena_staff(staff_id),
    },
    "clases": lista,
    "checadas": [{
      "id": c["id"], "tipo": c["tipo"], "estado": c["estado"], "hora": c["registrado_at"],
      "motivo": c.get("motivo"), "distancia_m": c.get("distancia_m"),
      "sucursal": (c.get("sucursales") or {}).get("nombre"),
    } for c in checadas],
    "horario": horario,
    "banco": _banco(staff_id, _es_direccion(s)),
    "puede_ver_banco_completo": _es_direccion(s),
  }


# ── Datos bancarios ───────────────────────────────────────────────────────────
class BancoIn(BaseModel):
  banco: str | None = None
  clabe: str | None = None
  titular: str | None = None


@router.put("/banco/{staff_id}")
async def guardar_banco(staff_id: str, body: BancoIn, request: Request):
  s = _admin(request)
  if not _es_direccion(s):
    raise HTTPException(status_code=403, detail="Solo Dirección puede capturar datos bancarios.")
  clabe = "".join(ch for ch in (body.clabe or "") if ch.isdigit()) or None
  if clabe and len(clabe) not in (16, 18):
    raise HTTPException(status_code=400, detail="La CLABE debe tener 18 dígitos (o 16 si es número de tarjeta).")
  supabase.table("staff_datos_bancarios").upsert({
    "staff_id": staff_id,
    "banco": (body.banco or "").strip() or None,
    "clabe": clabe,
    "titular": (body.titular or "").strip() or None,
    "updated_at": _ahora().isoformat(),
    "updated_by": s["id"],
  }).execute()
  return {"ok": True, "banco": _banco(staff_id, True)}


# ══════════════════════════════════════════════════════════════════════════════
# Parte 2: horarios, festivos, checadas (manual / anular) y faltas y retardos
# ══════════════════════════════════════════════════════════════════════════════
from datetime import date


def _config(clave: str, defecto):
  fila = supabase.table("staff_config").select("valor").eq("clave", clave).limit(1).execute().data
  return fila[0]["valor"] if fila else defecto


def _dia_semana(d: date) -> int:
  return d.isoweekday() % 7          # 0 = domingo … 6 = sábado


def _nombres(ids: set) -> dict:
  ids = {i for i in ids if i}
  if not ids:
    return {}
  filas = supabase.table("staff").select("id, nombre, primer_apellido").in_("id", list(ids)).execute().data or []
  return {f["id"]: f"{f.get('nombre') or ''} {f.get('primer_apellido') or ''}".strip() for f in filas}


def _sucursal_requerida(s: dict, sucursal_id: str | None) -> str:
  if not sucursal_id:
    raise HTTPException(status_code=400, detail="Elige una sucursal en el selector de arriba.")
  _alcance(s, sucursal_id)
  return sucursal_id


# ── Configuración ────────────────────────────────────────────────────────────
class ConfigIn(BaseModel):
  tolerancia_retardo_min: int


@router.get("/config")
async def ver_config(request: Request):
  _admin(request)
  return {"tolerancia_retardo_min": int(_config("tolerancia_retardo_min", 10))}


@router.put("/config")
async def guardar_config(body: ConfigIn, request: Request):
  s = _admin(request)
  if not _es_direccion(s):
    raise HTTPException(status_code=403, detail="Solo Dirección cambia la configuración.")
  if not 0 <= body.tolerancia_retardo_min <= 120:
    raise HTTPException(status_code=400, detail="La tolerancia debe estar entre 0 y 120 minutos.")
  supabase.table("staff_config").upsert({
    "clave": "tolerancia_retardo_min", "valor": body.tolerancia_retardo_min,
    "updated_at": _ahora().isoformat(), "updated_by": s["id"],
  }).execute()
  return {"ok": True}


# ── Horarios ─────────────────────────────────────────────────────────────────
@router.get("/horarios")
async def horarios(request: Request, sucursal_id: str | None = None):
  s = _admin(request)
  suc = _sucursal_requerida(s, sucursal_id)
  bloques = supabase.table("staff_horarios").select("staff_id, dia_semana, hora_entrada, hora_salida")\
    .eq("sucursal_id", suc).eq("activo", True).order("hora_entrada").execute().data or []
  por_staff: dict[str, list] = {}
  for b in bloques:
    por_staff.setdefault(b["staff_id"], []).append({
      "dia": b["dia_semana"], "entrada": b["hora_entrada"][:5], "salida": b["hora_salida"][:5]})
  return {"horarios": por_staff}


class Bloque(BaseModel):
  dia: int
  entrada: str
  salida: str


class HorarioIn(BaseModel):
  sucursal_id: str
  bloques: list[Bloque]


@router.put("/horarios/{staff_id}")
async def guardar_horario(staff_id: str, body: HorarioIn, request: Request):
  s = _admin(request)
  _alcance(s, body.sucursal_id)
  _puede_ver(s, staff_id)
  limpios = []
  for b in body.bloques:
    if not 0 <= b.dia <= 6:
      raise HTTPException(status_code=400, detail="Día inválido.")
    if b.salida <= b.entrada:
      raise HTTPException(status_code=400, detail=f"La salida debe ser después de la entrada ({b.entrada}–{b.salida}).")
    limpios.append(b)
  # Bloques del mismo día no se pueden encimar
  for d in range(7):
    del_dia = sorted([b for b in limpios if b.dia == d], key=lambda b: b.entrada)
    for a, c in zip(del_dia, del_dia[1:]):
      if c.entrada < a.salida:
        raise HTTPException(status_code=400, detail="Hay dos turnos encimados en el mismo día.")
  supabase.table("staff_horarios").delete().eq("staff_id", staff_id).eq("sucursal_id", body.sucursal_id).execute()
  if limpios:
    supabase.table("staff_horarios").insert([{
      "staff_id": staff_id, "sucursal_id": body.sucursal_id, "dia_semana": b.dia,
      "hora_entrada": b.entrada, "hora_salida": b.salida, "activo": True, "creado_por": s["id"],
    } for b in limpios]).execute()
  # Días laborales en la ficha (para el checador)
  dias = sorted({b.dia for b in limpios})
  supabase.table("staff").update({"dias_laborales": dias or None}).eq("id", staff_id).execute()
  return {"ok": True, "bloques": len(limpios)}


# ── Festivos ─────────────────────────────────────────────────────────────────
def _lunes(anio: int, mes: int, n: int) -> date:
  d = date(anio, mes, 1)
  while d.weekday() != 0:
    d += timedelta(days=1)
  return d + timedelta(weeks=n - 1)


def festivos_oficiales(anio: int) -> list[dict]:
  """Descansos obligatorios de la Ley Federal del Trabajo (art. 74)."""
  lista = [
    (date(anio, 1, 1), "Año Nuevo"),
    (_lunes(anio, 2, 1), "Día de la Constitución"),
    (_lunes(anio, 3, 3), "Natalicio de Benito Juárez"),
    (date(anio, 5, 1), "Día del Trabajo"),
    (date(anio, 9, 16), "Día de la Independencia"),
    (_lunes(anio, 11, 3), "Día de la Revolución"),
    (date(anio, 12, 25), "Navidad"),
  ]
  if (anio - 2024) % 6 == 0:
    lista.append((date(anio, 10, 1), "Transmisión del Poder Ejecutivo"))
  return [{"fecha": d.isoformat(), "nombre": n} for d, n in sorted(lista)]


@router.get("/festivos")
async def festivos(request: Request, anio: int | None = None):
  _admin(request)
  anio = anio or _ahora().astimezone(CDMX).year
  filas = supabase.table("dias_festivos").select("id, fecha, nombre, multiplicador, sucursal_id, sucursales(nombre)")\
    .eq("activo", True).gte("fecha", f"{anio}-01-01").lte("fecha", f"{anio}-12-31").order("fecha").execute().data or []
  return {"anio": anio, "festivos": [{
    "id": f["id"], "fecha": f["fecha"], "nombre": f["nombre"], "multiplicador": float(f["multiplicador"]),
    "sucursal_id": f.get("sucursal_id"), "sucursal": (f.get("sucursales") or {}).get("nombre"),
  } for f in filas], "oficiales": festivos_oficiales(anio)}


class FestivoIn(BaseModel):
  fecha: str
  nombre: str
  multiplicador: float = 3
  sucursal_id: str | None = None


def _solo_direccion(s: dict):
  if not _es_direccion(s):
    raise HTTPException(status_code=403, detail="Solo Dirección puede hacer este cambio.")


@router.post("/festivos")
async def crear_festivo(body: FestivoIn, request: Request):
  s = _admin(request)
  _solo_direccion(s)
  if not body.nombre.strip():
    raise HTTPException(status_code=400, detail="Ponle nombre al festivo.")
  if body.multiplicador < 1:
    raise HTTPException(status_code=400, detail="El multiplicador no puede ser menor a 1.")
  existe = supabase.table("dias_festivos").select("id").eq("fecha", body.fecha).eq("activo", True)
  existe = (existe.eq("sucursal_id", body.sucursal_id) if body.sucursal_id else existe.is_("sucursal_id", "null")).execute().data
  if existe:
    raise HTTPException(status_code=400, detail="Ese día ya está registrado como festivo.")
  supabase.table("dias_festivos").insert({
    "fecha": body.fecha, "nombre": body.nombre.strip(), "multiplicador": body.multiplicador,
    "sucursal_id": body.sucursal_id, "activo": True, "creado_por": s["id"],
  }).execute()
  return {"ok": True}


@router.post("/festivos/oficiales/{anio}")
async def cargar_oficiales(anio: int, request: Request):
  s = _admin(request)
  _solo_direccion(s)
  ya = {f["fecha"] for f in supabase.table("dias_festivos").select("fecha").is_("sucursal_id", "null")
        .gte("fecha", f"{anio}-01-01").lte("fecha", f"{anio}-12-31").execute().data or []}
  nuevos = [{"fecha": f["fecha"], "nombre": f["nombre"], "multiplicador": 3, "sucursal_id": None,
             "activo": True, "creado_por": s["id"]} for f in festivos_oficiales(anio) if f["fecha"] not in ya]
  if nuevos:
    supabase.table("dias_festivos").insert(nuevos).execute()
  return {"ok": True, "agregados": len(nuevos)}


@router.delete("/festivos/{festivo_id}")
async def borrar_festivo(festivo_id: str, request: Request):
  s = _admin(request)
  _solo_direccion(s)
  supabase.table("dias_festivos").update({"activo": False}).eq("id", festivo_id).execute()
  return {"ok": True}


# ── Checadas ─────────────────────────────────────────────────────────────────
def _rango(desde: str | None, hasta: str | None) -> tuple[datetime, datetime, date, date]:
  """Fechas (CDMX) → rango UTC. Por defecto, la quincena actual."""
  if desde and hasta:
    d1, d2 = date.fromisoformat(desde), date.fromisoformat(hasta)
  else:
    ini_q, fin_q = _quincena()
    d1, d2 = ini_q.astimezone(CDMX).date(), (fin_q - timedelta(days=1)).astimezone(CDMX).date()
  if d2 < d1 or (d2 - d1).days > 62:
    raise HTTPException(status_code=400, detail="El rango debe ser de máximo 2 meses.")
  ini = datetime(d1.year, d1.month, d1.day, tzinfo=CDMX).astimezone(timezone.utc)
  fin = datetime(d2.year, d2.month, d2.day, tzinfo=CDMX).astimezone(timezone.utc) + timedelta(days=1)
  return ini, fin, d1, d2


@router.get("/checadas")
async def checadas(request: Request, sucursal_id: str | None = None, desde: str | None = None,
                   hasta: str | None = None, staff_id: str | None = None):
  s = _admin(request)
  alcance = _alcance(s, sucursal_id)
  ini, fin, d1, d2 = _rango(desde, hasta)
  q = supabase.table("checadas")\
    .select("id, staff_id, sucursal_id, tipo, estado, registrado_at, motivo, distancia_m, confirmado_por, creado_por, staff:staff_id(nombre, primer_apellido), sucursales(nombre)")\
    .gte("registrado_at", ini.isoformat()).lt("registrado_at", fin.isoformat())\
    .order("registrado_at", desc=True).limit(3000)
  if alcance is not None:
    q = q.in_("sucursal_id", list(alcance))
  if staff_id:
    q = q.eq("staff_id", staff_id)
  filas = q.execute().data or []
  quien = _nombres({f.get("confirmado_por") for f in filas} | {f.get("creado_por") for f in filas})
  return {"desde": d1.isoformat(), "hasta": d2.isoformat(), "checadas": [{
    "id": f["id"], "staff_id": f["staff_id"],
    "nombre": f"{(f.get('staff') or {}).get('nombre') or ''} {(f.get('staff') or {}).get('primer_apellido') or ''}".strip(),
    "sucursal": (f.get("sucursales") or {}).get("nombre"), "tipo": f["tipo"], "estado": f["estado"],
    "hora": f["registrado_at"], "motivo": f.get("motivo"), "distancia_m": f.get("distancia_m"),
    "confirmo": quien.get(f.get("confirmado_por")), "capturo": quien.get(f.get("creado_por")),
  } for f in filas]}


class ManualIn(BaseModel):
  staff_id: str
  sucursal_id: str
  tipo: str            # entrada | salida
  hora: str            # ISO con zona
  motivo: str


@router.post("/checada-manual")
async def checada_manual(body: ManualIn, request: Request):
  """Para cuando alguien no trae celular. Queda marcada como manual, con quién la capturó y por qué."""
  s = _admin(request)
  _alcance(s, body.sucursal_id)
  _puede_ver(s, body.staff_id)
  if body.tipo not in ("entrada", "salida"):
    raise HTTPException(status_code=400, detail="Tipo inválido.")
  if len(body.motivo.strip()) < 5:
    raise HTTPException(status_code=400, detail="Escribe el motivo (por ejemplo: \"No trajo celular\").")
  if body.staff_id == s["id"]:
    raise HTTPException(status_code=400, detail="No puedes registrar tu propia checada manual.")
  hora = _dt(body.hora)
  ahora = _ahora()
  if hora > ahora + timedelta(minutes=5):
    raise HTTPException(status_code=400, detail="La hora no puede ser en el futuro.")
  limite = timedelta(days=31) if _es_direccion(s) else timedelta(hours=48)
  if ahora - hora > limite:
    raise HTTPException(status_code=400, detail="Un Manager solo puede capturar checadas de las últimas 48 horas. Para fechas anteriores, Dirección.")
  fila = supabase.table("checadas").insert({
    "staff_id": body.staff_id, "sucursal_id": body.sucursal_id, "tipo": body.tipo,
    "registrado_at": hora.isoformat(), "estado": "manual", "motivo": body.motivo.strip(),
    "creado_por": s["id"], "confirmado_por": s["id"], "confirmado_at": ahora.isoformat(),
  }).execute().data
  supabase.table("correcciones").insert({
    "tabla": "checadas", "registro_id": fila[0]["id"], "campo": "alta_manual",
    "valor_antes": None, "valor_despues": {"tipo": body.tipo, "hora": hora.isoformat()},
    "motivo": body.motivo.strip(), "hecho_por": s["id"],
  }).execute()
  return {"ok": True, "id": fila[0]["id"]}


class AnularIn(BaseModel):
  motivo: str


@router.post("/checadas/{checada_id}/anular")
async def anular_checada(checada_id: str, body: AnularIn, request: Request):
  """Solo Dirección. La checada no se borra: queda rechazada y el motivo en la bitácora."""
  s = _admin(request)
  _solo_direccion(s)
  if len(body.motivo.strip()) < 5:
    raise HTTPException(status_code=400, detail="Escribe el motivo de la corrección.")
  ch = supabase.table("checadas").select("id, estado, tipo, registrado_at").eq("id", checada_id).limit(1).execute().data
  if not ch:
    raise HTTPException(status_code=404, detail="No existe esa checada.")
  if ch[0]["estado"] == "rechazada":
    raise HTTPException(status_code=400, detail="Esa checada ya está anulada.")
  supabase.table("checadas").update({"estado": "rechazada", "motivo": f"Anulada por Dirección: {body.motivo.strip()}"})\
    .eq("id", checada_id).execute()
  supabase.table("correcciones").insert({
    "tabla": "checadas", "registro_id": checada_id, "campo": "estado",
    "valor_antes": {"estado": ch[0]["estado"]}, "valor_despues": {"estado": "rechazada"},
    "motivo": body.motivo.strip(), "hecho_por": s["id"],
  }).execute()
  return {"ok": True}


# ── Faltas y retardos ────────────────────────────────────────────────────────
@router.get("/bitacora")
async def bitacora(request: Request, sucursal_id: str | None = None, desde: str | None = None, hasta: str | None = None):
  """Compara el horario de cada persona con sus checadas. No descuenta nada: es para que Dirección decida."""
  s = _admin(request)
  alcance = _alcance(s, sucursal_id)
  ini, fin, d1, d2 = _rango(desde, hasta)
  tolerancia = int(_config("tolerancia_retardo_min", 10))
  ahora = _ahora()
  hoy = ahora.astimezone(CDMX).date()

  qh = supabase.table("staff_horarios").select("staff_id, sucursal_id, dia_semana, hora_entrada, hora_salida")\
    .eq("activo", True).order("hora_entrada")
  if alcance is not None:
    qh = qh.in_("sucursal_id", list(alcance))
  horarios = qh.execute().data or []
  if not horarios:
    return {"tolerancia": tolerancia, "desde": d1.isoformat(), "hasta": d2.isoformat(), "incidencias": [], "personas": []}

  ids = {h["staff_id"] for h in horarios}
  staff = {f["id"]: f for f in supabase.table("staff").select("id, nombre, primer_apellido, estatus")
           .in_("id", list(ids)).execute().data or []}
  sucs = {f["id"]: f["nombre"] for f in supabase.table("sucursales").select("id, nombre").execute().data or []}
  fest = supabase.table("dias_festivos").select("fecha, nombre, sucursal_id").eq("activo", True)\
    .gte("fecha", d1.isoformat()).lte("fecha", d2.isoformat()).execute().data or []
  festivos = {(f["fecha"], f.get("sucursal_id")): f["nombre"] for f in fest}

  entradas: dict[tuple, datetime] = {}
  for c in supabase.table("checadas").select("staff_id, sucursal_id, registrado_at")\
      .eq("tipo", "entrada").in_("estado", ["confirmada", "automatica", "manual"])\
      .in_("staff_id", list(ids)).gte("registrado_at", ini.isoformat()).lt("registrado_at", fin.isoformat())\
      .order("registrado_at").limit(10000).execute().data or []:
    t = _dt(c["registrado_at"])
    clave = (c["staff_id"], c["sucursal_id"], t.astimezone(CDMX).date())
    entradas.setdefault(clave, t)                     # la primera del día

  primer_bloque: dict[tuple, dict] = {}
  for h in horarios:
    primer_bloque.setdefault((h["staff_id"], h["sucursal_id"], h["dia_semana"]), h)

  incidencias = []
  d = d1
  while d <= min(d2, hoy):
    dia = _dia_semana(d)
    for (sid, suc, ds), h in primer_bloque.items():
      if ds != dia or (staff.get(sid) or {}).get("estatus", "Activo") not in ("Activo", None):
        continue
      hh, mm = int(h["hora_entrada"][:2]), int(h["hora_entrada"][3:5])
      programada = datetime(d.year, d.month, d.day, hh, mm, tzinfo=CDMX)
      llegada = entradas.get((sid, suc, d))
      festivo = festivos.get((d.isoformat(), suc)) or festivos.get((d.isoformat(), None))
      base = {"fecha": d.isoformat(), "staff_id": sid,
              "nombre": f"{staff.get(sid, {}).get('nombre') or ''} {staff.get(sid, {}).get('primer_apellido') or ''}".strip(),
              "sucursal": sucs.get(suc), "programada": h["hora_entrada"][:5],
              "llegada": llegada.isoformat() if llegada else None}
      if festivo:
        if llegada:
          incidencias.append({**base, "tipo": "festivo_trabajado", "detalle": festivo, "minutos": 0})
        continue
      if not llegada:
        if d == hoy and ahora < programada + timedelta(minutes=tolerancia):
          continue                                     # todavía no es hora
        incidencias.append({**base, "tipo": "falta", "detalle": None, "minutos": 0})
      else:
        tarde = int((llegada - programada).total_seconds() // 60)
        if tarde > tolerancia:
          incidencias.append({**base, "tipo": "retardo", "detalle": None, "minutos": tarde})
    d += timedelta(days=1)

  resumen: dict[str, dict] = {}
  for i in incidencias:
    r = resumen.setdefault(i["staff_id"], {"staff_id": i["staff_id"], "nombre": i["nombre"],
                                            "faltas": 0, "retardos": 0, "minutos_tarde": 0, "festivos_trabajados": 0})
    if i["tipo"] == "falta":
      r["faltas"] += 1
    elif i["tipo"] == "retardo":
      r["retardos"] += 1
      r["minutos_tarde"] += i["minutos"]
    else:
      r["festivos_trabajados"] += 1
  incidencias.sort(key=lambda i: (i["fecha"], i["nombre"]), reverse=True)
  return {"tolerancia": tolerancia, "desde": d1.isoformat(), "hasta": d2.isoformat(),
          "incidencias": incidencias,
          "personas": sorted(resumen.values(), key=lambda r: (-r["faltas"], -r["retardos"], r["nombre"]))}


# ══════════════════════════════════════════════════════════════════════════════
# Parte 3: tarifas por clase, sueldos por puesto y reglas de bono (solo Dirección)
# ══════════════════════════════════════════════════════════════════════════════
NIVELES = ["Seal", "Marine", "Elite", "Coach de Piso"]
PUESTOS_FIJO = ["Front", "The Galley", "Manager", "Submanager", "Regional", "Staff general"]
DURACIONES_BASE = [60, 70, 85, 90]


def _hoy() -> str:
  return _ahora().astimezone(CDMX).date().isoformat()


def _vigentes(filas: list, clave) -> dict:
  """De varias versiones de la misma regla, la vigente hoy (la más reciente que ya empezó)."""
  hoy, mejor = _hoy(), {}
  for f in sorted(filas, key=lambda f: f["vigente_desde"], reverse=True):
    if f["vigente_desde"] <= hoy:
      mejor.setdefault(clave(f), f)
  return mejor


def _duraciones_en_uso() -> list[int]:
  desde = (_ahora() - timedelta(days=60)).isoformat()
  filas = supabase.table("clases").select("duracion_minutos, nombre_clase").gte("horario", desde)\
    .neq("estado", "Cancelada").limit(5000).execute().data or []
  return sorted({f["duracion_minutos"] for f in filas if f.get("duracion_minutos") and not _es_open_gym(f.get("nombre_clase"))})


# ── Tarifas por clase ────────────────────────────────────────────────────────
@router.get("/tarifas")
async def ver_tarifas(request: Request):
  s = _admin(request)
  _solo_direccion(s)
  filas = supabase.table("tarifas_coach").select("id, sucursal_id, nivel, duracion_minutos, modo, monto, vigente_desde")\
    .eq("activo", True).is_("tipo_clase", "null").execute().data or []
  vig = _vigentes(filas, lambda f: (f["nivel"], f.get("duracion_minutos"), f.get("sucursal_id")))
  en_uso = _duraciones_en_uso()
  return {
    "niveles": NIVELES,
    "duraciones": sorted(set(DURACIONES_BASE) | set(en_uso)),
    "duraciones_en_uso": en_uso,
    "tarifas": [{"nivel": k[0], "duracion": k[1], "sucursal_id": k[2], "monto": float(f["monto"]),
                 "modo": f["modo"], "vigente_desde": f["vigente_desde"]} for k, f in vig.items()],
  }


class TarifaIn(BaseModel):
  nivel: str
  duracion: int
  sucursal_id: str | None = None
  monto: float | None = None      # None = quitar (en una sucursal, vuelve a usar la general)


@router.put("/tarifas")
async def guardar_tarifa(body: TarifaIn, request: Request):
  s = _admin(request)
  _solo_direccion(s)
  if body.monto is not None and body.monto < 0:
    raise HTTPException(status_code=400, detail="El monto no puede ser negativo.")
  q = supabase.table("tarifas_coach").select("id, vigente_desde").eq("nivel", body.nivel)\
    .eq("duracion_minutos", body.duracion).eq("activo", True).is_("tipo_clase", "null")
  q = q.eq("sucursal_id", body.sucursal_id) if body.sucursal_id else q.is_("sucursal_id", "null")
  existentes = q.execute().data or []
  hoy = _hoy()
  if body.monto is None:
    # Se desactiva de hoy en adelante; lo ya pagado no cambia (va congelado en cada clase)
    for f in existentes:
      supabase.table("tarifas_coach").update({"activo": False}).eq("id", f["id"]).execute()
    return {"ok": True}
  de_hoy = [f for f in existentes if f["vigente_desde"] == hoy]
  if de_hoy:
    supabase.table("tarifas_coach").update({"monto": body.monto, "modo": "por_clase"}).eq("id", de_hoy[0]["id"]).execute()
  else:
    # Nueva versión desde hoy: las clases anteriores conservan la tarifa que tenían
    supabase.table("tarifas_coach").insert({
      "nivel": body.nivel, "duracion_minutos": body.duracion, "sucursal_id": body.sucursal_id,
      "modo": "por_clase", "monto": body.monto, "vigente_desde": hoy, "activo": True, "creado_por": s["id"],
    }).execute()
  return {"ok": True}


# ── Sueldos por puesto y sucursal ────────────────────────────────────────────
@router.get("/sueldos")
async def ver_sueldos(request: Request):
  s = _admin(request)
  _solo_direccion(s)
  filas = supabase.table("sueldos_puesto").select("id, puesto, sucursal_id, monto_quincenal, vigente_desde")\
    .eq("activo", True).execute().data or []
  vig = _vigentes(filas, lambda f: (f["puesto"], f.get("sucursal_id")))
  conteo: dict[str, int] = {}
  for st in supabase.table("staff").select("tipo").eq("estatus", "Activo").in_("tipo_pago", ["Fijo", "Fijo + clases"]).execute().data or []:
    conteo[st.get("tipo") or "Staff general"] = conteo.get(st.get("tipo") or "Staff general", 0) + 1
  return {"puestos": PUESTOS_FIJO, "personas_por_puesto": conteo,
          "sueldos": [{"puesto": k[0], "sucursal_id": k[1], "monto": float(f["monto_quincenal"]),
                       "vigente_desde": f["vigente_desde"]} for k, f in vig.items()]}


class SueldoIn(BaseModel):
  puesto: str
  sucursal_id: str | None = None
  monto: float | None = None


@router.put("/sueldos")
async def guardar_sueldo(body: SueldoIn, request: Request):
  s = _admin(request)
  _solo_direccion(s)
  if body.monto is not None and body.monto < 0:
    raise HTTPException(status_code=400, detail="El monto no puede ser negativo.")
  q = supabase.table("sueldos_puesto").select("id, vigente_desde").eq("puesto", body.puesto).eq("activo", True)
  q = q.eq("sucursal_id", body.sucursal_id) if body.sucursal_id else q.is_("sucursal_id", "null")
  existentes = q.execute().data or []
  hoy = _hoy()
  if body.monto is None:
    for f in existentes:
      supabase.table("sueldos_puesto").update({"activo": False}).eq("id", f["id"]).execute()
    return {"ok": True}
  de_hoy = [f for f in existentes if f["vigente_desde"] == hoy]
  if de_hoy:
    supabase.table("sueldos_puesto").update({"monto_quincenal": body.monto}).eq("id", de_hoy[0]["id"]).execute()
  else:
    supabase.table("sueldos_puesto").insert({
      "puesto": body.puesto, "sucursal_id": body.sucursal_id, "monto_quincenal": body.monto,
      "vigente_desde": hoy, "activo": True, "creado_por": s["id"],
    }).execute()
  return {"ok": True}


# ── Reglas de bono ───────────────────────────────────────────────────────────
class ReglaIn(BaseModel):
  nombre: str
  monto: float
  niveles: list[str] | None = None
  sucursal_ids: list[str] | None = None
  tipos_clase: list[str] | None = None
  duraciones: list[int] | None = None
  dias_semana: list[int] | None = None
  hora_desde: str | None = None
  hora_hasta: str | None = None
  min_asistentes: int | None = None
  min_ocupacion_pct: int | None = None
  acumulable: bool = False
  vigente_desde: str | None = None
  vigente_hasta: str | None = None


def _regla_limpia(b: ReglaIn) -> dict:
  if not b.nombre.strip():
    raise HTTPException(status_code=400, detail="Ponle nombre a la regla.")
  if b.monto <= 0:
    raise HTTPException(status_code=400, detail="El monto del bono debe ser mayor a 0.")
  if b.min_asistentes is None and b.min_ocupacion_pct is None:
    raise HTTPException(status_code=400, detail="Pon un mínimo de asistentes o de ocupación: el bono es por cuántos llegaron.")
  if b.hora_desde and b.hora_hasta and b.hora_hasta <= b.hora_desde:
    raise HTTPException(status_code=400, detail="La hora final debe ser después de la inicial.")
  vacio = lambda x: x if x else None
  return {
    "nombre": b.nombre.strip(), "monto": b.monto, "niveles": vacio(b.niveles), "sucursal_ids": vacio(b.sucursal_ids),
    "tipos_clase": vacio(b.tipos_clase), "duraciones": vacio(b.duraciones), "dias_semana": vacio(b.dias_semana),
    "hora_desde": b.hora_desde or None, "hora_hasta": b.hora_hasta or None,
    "min_asistentes": b.min_asistentes, "min_ocupacion_pct": b.min_ocupacion_pct, "acumulable": b.acumulable,
    "vigente_desde": b.vigente_desde or _hoy(), "vigente_hasta": b.vigente_hasta or None,
  }


@router.get("/bonos")
async def ver_bonos(request: Request):
  s = _admin(request)
  _solo_direccion(s)
  reglas = supabase.table("reglas_bono").select("*").eq("activo", True).order("created_at").execute().data or []
  desde = (_ahora() - timedelta(days=60)).isoformat()
  tipos = sorted({(f.get("tipo_clase") or "").strip() for f in supabase.table("clases").select("tipo_clase")
                  .gte("horario", desde).limit(5000).execute().data or [] if (f.get("tipo_clase") or "").strip()})
  return {"reglas": reglas, "niveles": NIVELES, "tipos_clase": tipos, "duraciones": _duraciones_en_uso()}


@router.post("/bonos")
async def crear_bono(body: ReglaIn, request: Request):
  s = _admin(request)
  _solo_direccion(s)
  supabase.table("reglas_bono").insert({**_regla_limpia(body), "creado_por": s["id"]}).execute()
  return {"ok": True}


@router.put("/bonos/{regla_id}")
async def editar_bono(regla_id: str, body: ReglaIn, request: Request):
  s = _admin(request)
  _solo_direccion(s)
  supabase.table("reglas_bono").update({**_regla_limpia(body), "updated_at": _ahora().isoformat()}).eq("id", regla_id).execute()
  return {"ok": True}


@router.delete("/bonos/{regla_id}")
async def borrar_bono(regla_id: str, request: Request):
  s = _admin(request)
  _solo_direccion(s)
  supabase.table("reglas_bono").update({"activo": False, "updated_at": _ahora().isoformat()}).eq("id", regla_id).execute()
  return {"ok": True}