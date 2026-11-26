# routers/checador.py  →  prefijo /checador
# Checador de staff: QR de un solo uso en Front Desk, escaneo desde el celular,
# confirmación de Front Desk, clases del día y generación de clases impartidas.
#
# Reglas:
#   - Solo Front / Manager / Submanager / admin generan QRs y confirman, y solo de sus sucursales.
#   - El QR se quema al escanearse y vence a los pocos segundos.
#   - El celular tiene que estar a menos de RADIO_M metros de la sucursal.
#   - Coach (tipo_pago "Por clase"): solo puede checar entrada si tiene clases hoy en esa sucursal,
#     desde VENTANA_ANTES_MIN minutos antes de su primera clase hasta que termina la última.
#   - Staff de "Por hora" y "Fijo + clases" (incluye The Galley): siempre puede checar; se marca si no era
#     su día según su horario semanal, y su salida se cierra sola 10 min después de su hora de salida.
#   - Toda entrada queda "pendiente" hasta que Front Desk la confirme. Nadie confirma la suya,
#     salvo el primero de Front Desk / gerencia que llega cuando no hay nadie más para confirmarlo.
#   - La salida no necesita confirmación.
import hashlib, math, os, secrets, time
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from services.supabase import supabase

router = APIRouter()

CDMX               = timezone(timedelta(hours=-6))
CRM_URL            = "https://crm.navytrainingcenter.com"
QR_VIDA_SEG        = 15      # cuánto vive un QR sin usarse
RADIO_M            = 300     # distancia máxima a la sucursal
# Validación de ubicación: apagada por defecto mientras se prueba.
# Para prenderla: en Railway, variable CHECADOR_UBICACION=on (no hay que tocar código).
VALIDAR_UBICACION  = os.getenv("CHECADOR_UBICACION", "off").lower() == "on"
VENTANA_ANTES_MIN  = 120     # coach: puede checar desde 2 h antes de su primera clase
VENTANA_TURNO_MIN  = 60      # staff, managers y dirección: desde 1 h antes de su turno
TOLERANCIA_MIN     = 15      # una clase cuenta si checó antes de inicio + 15 min
GRACIA_SALIDA_MIN  = 10      # el staff que olvida su salida se cierra 10 min después de su hora
TIPOS_OPERADOR     = {"front", "manager", "submanager", "admin"}
ROLES_ADMIN        = {"admin", "super_admin", "direccion", "dirección", "director"}   # rol "gerente" también opera el checador


# ══════════════════════════════════════════════════════════════════════════════
# Utilidades
# ══════════════════════════════════════════════════════════════════════════════

def _ahora() -> datetime:
  return datetime.now(timezone.utc)


def _dt(valor) -> datetime:
  return datetime.fromisoformat(str(valor).replace("Z", "+00:00"))


def _hash(codigo: str) -> str:
  return hashlib.sha256(codigo.encode()).hexdigest()


def _dia_cdmx(momento: datetime | None = None) -> tuple[datetime, datetime]:
  """Inicio y fin (en UTC) del día de hoy en CDMX."""
  local = (momento or _ahora()).astimezone(CDMX)
  inicio = local.replace(hour=0, minute=0, second=0, microsecond=0)
  return inicio.astimezone(timezone.utc), (inicio + timedelta(days=1)).astimezone(timezone.utc)


def _distancia_m(lat1, lon1, lat2, lon2) -> float:
  r = 6371000
  p1, p2 = math.radians(lat1), math.radians(lat2)
  dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
  a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
  return 2 * r * math.asin(math.sqrt(a))


def _nombre(s: dict) -> str:
  return " ".join(x for x in [(s.get("nombre") or "").strip(), (s.get("primer_apellido") or "").strip()] if x)


def _ip(request: Request) -> str | None:
  fwd = request.headers.get("x-forwarded-for")
  return (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else None)) or None


# ══════════════════════════════════════════════════════════════════════════════
# Sesión: quién es el staff que llama
# ══════════════════════════════════════════════════════════════════════════════

# Caché en memoria: evita validar la sesión y buscar al staff en cada llamada
# (la pantalla de Front Desk consulta cada 2 s). Dura 2 minutos.
CACHE_SEG = 120
_cache_staff: dict[str, tuple[float, dict]] = {}
_cache_sucursales: dict[str, tuple[float, set]] = {}


def _limpiar_cache():
  if len(_cache_staff) > 500 or len(_cache_sucursales) > 500:
    ahora = time.time()
    for c in (_cache_staff, _cache_sucursales):
      for k in [k for k, (vence, _) in c.items() if vence < ahora]:
        c.pop(k, None)


def _staff(request: Request) -> dict:
  auth = request.headers.get("authorization") or ""
  if not auth.lower().startswith("bearer "):
    raise HTTPException(status_code=401, detail="Inicia sesión para continuar.")
  token = auth[7:].strip()
  hit = _cache_staff.get(token)
  if hit and hit[0] > time.time():
    return hit[1]
  try:
    usuario = supabase.auth.get_user(token).user
  except Exception:
    usuario = None
  if not usuario:
    raise HTTPException(status_code=401, detail="Tu sesión venció. Vuelve a iniciar sesión.")

  sel = "id, nombre, primer_apellido, email, tipo, rol, nivel, tipo_pago, estatus, dias_laborales, sucursal_asignada_id, supabase_user_id"
  filas = supabase.table("staff").select(sel).eq("supabase_user_id", usuario.id).limit(1).execute().data
  if not filas and usuario.email:
    filas = supabase.table("staff").select(sel).ilike("email", usuario.email.strip()).limit(1).execute().data
    if filas and not filas[0].get("supabase_user_id"):
      supabase.table("staff").update({"supabase_user_id": usuario.id}).eq("id", filas[0]["id"]).execute()
  if not filas:
    raise HTTPException(status_code=403, detail="Tu usuario no está dado de alta como staff de Navy.")
  s = filas[0]
  if (s.get("estatus") or "").lower() in ("inactivo", "baja"):
    raise HTTPException(status_code=403, detail="Tu usuario de staff está inactivo.")
  _limpiar_cache()
  _cache_staff[token] = (time.time() + CACHE_SEG, s)
  return s


def _es_admin(s: dict) -> bool:
  return (s.get("tipo") or "").lower() == "admin" or (s.get("rol") or "").lower() in ROLES_ADMIN


def _sucursales_de(s: dict) -> set[str]:
  hit = _cache_sucursales.get(s["id"])
  if hit and hit[0] > time.time():
    return hit[1]
  if _es_admin(s):
    ids = {x["id"] for x in supabase.table("sucursales").select("id").execute().data or []}
  else:
    ids = {x["sucursal_id"] for x in supabase.table("staff_sucursales").select("sucursal_id").eq("staff_id", s["id"]).execute().data or []}
    if s.get("sucursal_asignada_id"):
      ids.add(s["sucursal_asignada_id"])
  _cache_sucursales[s["id"]] = (time.time() + CACHE_SEG, ids)
  return ids


def _puede_operar(s: dict) -> bool:
  return _es_admin(s) or (s.get("tipo") or "").lower() in TIPOS_OPERADOR or (s.get("rol") or "").lower() == "gerente"


def _operador(request: Request, sucursal_id: str | None = None) -> dict:
  s = _staff(request)
  if not _puede_operar(s):
    raise HTTPException(status_code=403, detail="El checador solo lo pueden abrir Front Desk, Managers y admins.")
  if sucursal_id and sucursal_id not in _sucursales_de(s):
    raise HTTPException(status_code=403, detail="No tienes acceso al checador de esta sucursal.")
  return s


# ══════════════════════════════════════════════════════════════════════════════
# Clases del día de un coach
# ══════════════════════════════════════════════════════════════════════════════

def _clases_hoy(staff_id: str, sucursal_id: str, con_alumnos: bool = False) -> list[dict]:
  ini, fin = _dia_cdmx()
  clases = supabase.table("clases")\
    .select("id, nombre_clase, horario, duracion_minutos, capacidad_max, estado, room_id, rooms(nombre)")\
    .eq("coach_id", staff_id).eq("sucursal_id", sucursal_id)\
    .gte("horario", ini.isoformat()).lt("horario", fin.isoformat())\
    .neq("estado", "Cancelada").order("horario").execute().data or []

  salida = []
  for c in clases:
    reservas = supabase.table("reservas")\
      .select("id, estatus, origen, lista_espera, nombre_externo, clientes(nombre_completo)")\
      .eq("clase_id", c["id"]).neq("estatus", "Cancelada").execute().data or []
    activas = [r for r in reservas if not r.get("lista_espera")]
    item = {
      "id": c["id"], "nombre": (c.get("nombre_clase") or "").strip(), "horario": c["horario"],
      "duracion": c.get("duracion_minutos") or 60, "cupo": c.get("capacidad_max") or 0,
      "room": (c.get("rooms") or {}).get("nombre"),
      "reservas": len(activas), "lista_espera": len(reservas) - len(activas),
    }
    if con_alumnos:
      item["alumnos"] = [{
        "nombre": (r.get("clientes") or {}).get("nombre_completo") or r.get("nombre_externo") or "Invitado",
        "origen": r.get("origen") or "App",
        "lista_espera": bool(r.get("lista_espera")),
      } for r in reservas]
    salida.append(item)
  return salida


def _es_coach(s: dict) -> bool:
  return (s.get("tipo_pago") or "") == "Por clase"


def _adentro_hoy(sucursal_id: str) -> dict[str, dict]:
  """Staff con entrada confirmada hoy en la sucursal y sin salida posterior: {staff_id: checada}."""
  ini, _ = _dia_cdmx()
  filas = supabase.table("checadas").select("id, staff_id, tipo, estado, registrado_at")\
    .eq("sucursal_id", sucursal_id).gte("registrado_at", ini.isoformat()).neq("estado", "rechazada")\
    .order("registrado_at").execute().data or []
  adentro: dict[str, dict] = {}
  for f in filas:
    if f["tipo"] == "entrada" and f["estado"] in ("confirmada", "automatica", "manual"):
      adentro[f["staff_id"]] = f
    elif f["tipo"] == "salida":
      adentro.pop(f["staff_id"], None)
  return adentro


def _sucursal_hoy(sucursal_id: str) -> list[dict]:
  """Para la pantalla del staff: las clases de hoy, su coach y si ya llegó."""
  ini, fin = _dia_cdmx()
  clases = supabase.table("clases")\
    .select("id, nombre_clase, horario, duracion_minutos, capacidad_max, coach_id, staff:coach_id(nombre, primer_apellido)")\
    .eq("sucursal_id", sucursal_id).gte("horario", ini.isoformat()).lt("horario", fin.isoformat())\
    .neq("estado", "Cancelada").order("horario").execute().data or []
  adentro = _adentro_hoy(sucursal_id)
  out = []
  for c in clases:
    if "open gym" in (c.get("nombre_clase") or "").lower():
      continue
    n = supabase.table("reservas").select("id", count="exact", head=True)\
      .eq("clase_id", c["id"]).neq("estatus", "Cancelada").eq("lista_espera", False).execute().count or 0
    out.append({
      "id": c["id"], "nombre": (c.get("nombre_clase") or "").strip(), "horario": c["horario"],
      "duracion": c.get("duracion_minutos") or 60, "cupo": c.get("capacidad_max") or 0, "reservas": n,
      "coach": _nombre(c.get("staff") or {}) or None,
      "coach_llego": bool(c.get("coach_id") and c["coach_id"] in adentro),
    })
  return out


def _quincena_inicio(d: date) -> date:
  return d.replace(day=1 if d.day <= 15 else 16)


def horarios_efectivos(staff_ids: list | None, sucursales: set | None, d1: date, d2: date) -> dict:
  """Turnos de cada persona por día, del d1 al d2 (incluidos): {(staff_id, sucursal_id, 'YYYY-MM-DD'): [('07:00', '15:00'), …]}.
  Si su quincena se capturó por fechas, manda la quincena (un día sin turno es descanso);
  si no, se usa su horario fijo semanal. Sin ninguno de los dos, ese día no tiene turno."""
  def filtrar(q):
    if staff_ids is not None:
      q = q.in_("staff_id", list(staff_ids))
    if sucursales is not None:
      q = q.in_("sucursal_id", list(sucursales))
    return q
  if staff_ids is not None and not staff_ids:
    return {}
  semana: dict[tuple, list] = {}
  for h in filtrar(supabase.table("staff_horarios").select("staff_id, sucursal_id, dia_semana, hora_entrada, hora_salida")
                   .eq("activo", True)).limit(20000).execute().data or []:
    semana.setdefault((h["staff_id"], h["sucursal_id"], h["dia_semana"]), []).append((h["hora_entrada"][:5], h["hora_salida"][:5]))
  por_fecha: dict[tuple, list] = {}
  for t in filtrar(supabase.table("staff_turnos").select("staff_id, sucursal_id, fecha, hora_entrada, hora_salida")
                   .gte("fecha", d1.isoformat()).lte("fecha", d2.isoformat())).limit(20000).execute().data or []:
    por_fecha.setdefault((t["staff_id"], t["sucursal_id"], t["fecha"]), []).append((t["hora_entrada"][:5], t["hora_salida"][:5]))
  marcadas = {(m["staff_id"], m["sucursal_id"], m["quincena_inicio"]) for m in
              filtrar(supabase.table("staff_turnos_quincenas").select("staff_id, sucursal_id, quincena_inicio")
                      .gte("quincena_inicio", _quincena_inicio(d1).isoformat()).lte("quincena_inicio", d2.isoformat()))
              .limit(20000).execute().data or []}
  pares = {(k[0], k[1]) for k in semana} | {(k[0], k[1]) for k in por_fecha} | {(k[0], k[1]) for k in marcadas}
  out: dict[tuple, list] = {}
  d = d1
  while d <= d2:
    q, dia, f = _quincena_inicio(d).isoformat(), d.isoweekday() % 7, d.isoformat()
    for sid, suc in pares:
      bloques = por_fecha.get((sid, suc, f), []) if (sid, suc, q) in marcadas else semana.get((sid, suc, dia), [])
      if bloques:
        out[(sid, suc, f)] = sorted(bloques)
    d += timedelta(days=1)
  return out


def bloques_del_dia(staff_id: str, sucursal_id: str, fecha: date) -> list:
  return horarios_efectivos([staff_id], {sucursal_id}, fecha, fecha).get((staff_id, sucursal_id, fecha.isoformat()), [])


def _proximo_turno(staff_id: str, sucursal_id: str) -> str | None:
  """El siguiente turno (en las próximas 3 semanas), como texto: 'viernes 20 · 7:00'."""
  ahora = _ahora().astimezone(CDMX)
  hoy = ahora.date()
  ef = horarios_efectivos([staff_id], {sucursal_id}, hoy, hoy + timedelta(days=21))
  dias = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
  d = hoy
  while d <= hoy + timedelta(days=21):
    for ent, _sal in ef.get((staff_id, sucursal_id, d.isoformat()), []):
      if d > hoy or ent > ahora.strftime("%H:%M"):
        return f"{'hoy' if d == hoy else ('mañana' if d == hoy + timedelta(days=1) else f'{dias[d.weekday()]} {d.day}')} · {ent}"
    d += timedelta(days=1)
  return None


def _hora_hoy(hhmm: str) -> datetime:
  local = _ahora().astimezone(CDMX)
  return local.replace(hour=int(hhmm[0:2]), minute=int(hhmm[3:5]), second=0, microsecond=0).astimezone(timezone.utc)


def _turno_de_hoy(staff_id: str, sucursal_id: str) -> tuple[bool, datetime | None]:
  """¿Tiene turno hoy (horario efectivo)? y su salida programada (la del bloque vigente o el siguiente)."""
  bloques = bloques_del_dia(staff_id, sucursal_id, _ahora().astimezone(CDMX).date())
  if not bloques:
    return False, None
  salidas = [_hora_hoy(b[1]) for b in bloques]
  return True, next((x for x in salidas if x > _ahora()), salidas[-1])


PUESTOS = {"front": "Front Desk", "galley": "The Galley", "manager": "Manager", "submanager": "Submanager",
           "admin": "Dirección", "staff": "Staff", "staff general": "Staff"}


def _puesto(st: dict) -> str:
  t = (st.get("tipo") or "").strip().lower()
  if t == "coach":
    return f"Coach · {st['nivel']}" if st.get("nivel") else "Coach"
  return PUESTOS.get(t, (st.get("tipo") or "Staff").strip())


def _iniciales(st: dict) -> str:
  partes = [(st.get("nombre") or "").strip(), (st.get("primer_apellido") or "").strip()]
  palabras = " ".join(x for x in partes if x).split()
  if not palabras:
    return "?"
  return (palabras[0][0] + (palabras[1][0] if len(palabras) > 1 else "")).upper()


def _quincena(momento: datetime | None = None) -> tuple[datetime, datetime]:
  """Inicio y fin (UTC) de la quincena actual en CDMX: del 1 al 15 y del 16 a fin de mes."""
  local = (momento or _ahora()).astimezone(CDMX).replace(hour=0, minute=0, second=0, microsecond=0)
  if local.day <= 15:
    ini, fin = local.replace(day=1), local.replace(day=16)
  else:
    ini = local.replace(day=16)
    fin = (local.replace(day=28) + timedelta(days=4)).replace(day=1)
  return ini.astimezone(timezone.utc), fin.astimezone(timezone.utc)


def _horario_semana(staff_id: str, sucursal_id: str) -> dict:
  bloques = supabase.table("staff_horarios").select("dia_semana, hora_entrada, hora_salida")\
    .eq("staff_id", staff_id).eq("sucursal_id", sucursal_id).eq("activo", True)\
    .order("hora_entrada").execute().data or []
  local = _ahora().astimezone(CDMX)
  hoy = local.isoweekday() % 7
  efectivo = bloques_del_dia(staff_id, sucursal_id, local.date())     # quincena capturada > horario fijo
  return {
    "dias": sorted({b["dia_semana"] for b in bloques}),
    "hoy_idx": hoy,
    "hoy": [{"entrada": e, "salida": x} for e, x in efectivo],
  }


def _quincena_staff(staff_id: str, sucursal_id: str | None = None) -> dict:
  """Días trabajados y horas de la quincena (entrada → salida; si sigue adentro, hasta ahora)."""
  ini, fin = _quincena()
  q = supabase.table("checadas").select("tipo, estado, registrado_at").eq("staff_id", staff_id)\
    .gte("registrado_at", ini.isoformat()).lt("registrado_at", fin.isoformat()).neq("estado", "rechazada")
  if sucursal_id:
    q = q.eq("sucursal_id", sucursal_id)
  filas = q.order("registrado_at").execute().data or []
  dias, minutos, abierta = set(), 0.0, None
  for f in filas:
    t = _dt(f["registrado_at"])
    if f["tipo"] == "entrada" and f["estado"] in ("confirmada", "automatica", "manual"):
      abierta = t
      dias.add(t.astimezone(CDMX).date())
    elif f["tipo"] == "salida" and abierta:
      minutos += (t - abierta).total_seconds() / 60
      abierta = None
  if abierta and abierta.astimezone(CDMX).date() == _ahora().astimezone(CDMX).date():
    minutos += (_ahora() - abierta).total_seconds() / 60
  return {"dias": len(dias), "horas": round(minutos / 60, 1)}


def _ficha(f: dict, sucursal_id: str) -> dict:
  """Todo lo que Front Desk necesita ver en el pop-up para confirmar a alguien."""
  st = f.get("staff") or {}
  es_coach = (st.get("tipo_pago") or "") == "Por clase"
  ficha = {
    "id": f["id"], "staff_id": f["staff_id"], "tipo": f["tipo"], "hora": f["registrado_at"],
    "nombre": _nombre(st), "iniciales": _iniciales(st), "puesto": _puesto(st),
    "tipo_staff": st.get("tipo"), "nivel": st.get("nivel"), "tipo_pago": st.get("tipo_pago"),
    "es_coach": es_coach, "distancia_m": f.get("distancia_m"), "dia_asignado": f.get("dia_asignado"),
    "quincena": _quincena_staff(f["staff_id"], sucursal_id),
  }
  if es_coach:
    ficha["clases"] = _clases_hoy(f["staff_id"], sucursal_id)
  else:
    h = _horario_semana(f["staff_id"], sucursal_id)
    ficha["horario"] = h
    if h["hoy"]:
      llegada = _dt(f["registrado_at"]).astimezone(CDMX)
      hh, mm = int(h["hoy"][0]["entrada"][:2]), int(h["hoy"][0]["entrada"][3:5])
      programada = llegada.replace(hour=hh, minute=mm, second=0, microsecond=0)
      ficha["minutos_antes"] = int((programada - llegada).total_seconds() // 60)
  return ficha


# ══════════════════════════════════════════════════════════════════════════════
# Front Desk: sucursales, QR, pendientes y confirmación
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/sucursales")
async def sucursales(request: Request):
  s = _operador(request)
  ids = list(_sucursales_de(s))
  if not ids:
    return {"sucursales": []}
  filas = supabase.table("sucursales").select("id, nombre").in_("id", ids).eq("estatus", "Activa").order("nombre").execute().data or []
  return {"operador": _nombre(s), "sucursales": filas}


class PedirQR(BaseModel):
  sucursal_id: str


@router.post("/qr")
async def qr(body: PedirQR, request: Request):
  s = _operador(request, body.sucursal_id)
  codigo = secrets.token_urlsafe(18)
  expira = _ahora() + timedelta(seconds=QR_VIDA_SEG)
  supabase.table("checador_codigos").insert({
    "sucursal_id": body.sucursal_id, "emitido_por": s["id"],
    "codigo_hash": _hash(codigo), "expira_at": expira.isoformat(),
    "ip": _ip(request), "user_agent": (request.headers.get("user-agent") or "")[:300],
  }).execute()
  return {"url": f"{CRM_URL}/c/{codigo}", "expira_at": expira.isoformat(), "vida_seg": QR_VIDA_SEG}


@router.get("/pendientes")
async def pendientes(sucursal_id: str, request: Request):
  """Se consulta cada 2 s: quién espera confirmación (con su ficha) y una marca del último movimiento,
  para que la pantalla sepa cuándo renovar el QR y el tablero."""
  _operador(request, sucursal_id)
  ini, _ = _dia_cdmx()

  pend = supabase.table("checadas")\
    .select("id, staff_id, tipo, estado, registrado_at, distancia_m, dia_asignado, staff:staff_id(nombre, primer_apellido, nivel, tipo, tipo_pago)")\
    .eq("sucursal_id", sucursal_id).eq("estado", "pendiente").gte("registrado_at", ini.isoformat())\
    .order("registrado_at").limit(10).execute().data or []

  ult_ch = supabase.table("checadas").select("created_at").eq("sucursal_id", sucursal_id)\
    .gte("created_at", ini.isoformat()).order("created_at", desc=True).limit(1).execute().data
  ult_in = supabase.table("checadas_intentos").select("created_at").eq("sucursal_id", sucursal_id)\
    .gte("created_at", ini.isoformat()).order("created_at", desc=True).limit(1).execute().data
  marca = max([x[0]["created_at"] for x in (ult_ch, ult_in) if x] or [""])

  return {"por_confirmar": [_ficha(f, sucursal_id) for f in pend], "ultimo_movimiento": marca}


@router.get("/tablero")
async def tablero(sucursal_id: str, request: Request):
  """El tablero de la sucursal para Front Desk: quién está adentro, clases del día con su coach,
  alertas, números del día y movimientos."""
  _operador(request, sucursal_id)
  ini, fin = _dia_cdmx()
  ahora = _ahora()

  checadas = supabase.table("checadas")\
    .select("id, staff_id, tipo, estado, registrado_at, motivo, staff:staff_id(nombre, primer_apellido, nivel, tipo, tipo_pago)")\
    .eq("sucursal_id", sucursal_id).gte("registrado_at", ini.isoformat())\
    .order("registrado_at").execute().data or []
  intentos = supabase.table("checadas_intentos")\
    .select("id, motivo, detalle, created_at, staff:staff_id(nombre, primer_apellido)")\
    .eq("sucursal_id", sucursal_id).gte("created_at", ini.isoformat())\
    .order("created_at", desc=True).limit(30).execute().data or []

  adentro: dict[str, dict] = {}
  llegaron: set[str] = set()
  entradas = salidas = 0
  ultima = None
  for c in checadas:
    st = c.get("staff") or {}
    if c["tipo"] == "entrada" and c["estado"] in ("confirmada", "automatica", "manual"):
      entradas += 1
      llegaron.add(c["staff_id"])
      adentro[c["staff_id"]] = {"iniciales": _iniciales(st), "nombre": _nombre(st), "puesto": _puesto(st),
                                "desde": c["registrado_at"], "es_coach": (st.get("tipo_pago") or "") == "Por clase"}
      ultima = {"iniciales": _iniciales(st), "nombre": _nombre(st), "hora": c["registrado_at"], "estado": c["estado"]}
    elif c["tipo"] == "salida" and c["estado"] != "rechazada":
      salidas += 1
      adentro.pop(c["staff_id"], None)

  # Clases de hoy con su coach y en qué va cada una
  clases = supabase.table("clases")\
    .select("id, nombre_clase, horario, duracion_minutos, capacidad_max, coach_id, staff:coach_id(nombre, primer_apellido)")\
    .eq("sucursal_id", sucursal_id).gte("horario", ini.isoformat()).lt("horario", fin.isoformat())\
    .neq("estado", "Cancelada").order("horario").execute().data or []
  lista, alertas, terminadas = [], [], 0
  for c in clases:
    if "open gym" in (c.get("nombre_clase") or "").lower():
      continue
    inicio = _dt(c["horario"])
    fin_c = inicio + timedelta(minutes=c.get("duracion_minutos") or 60)
    coach = _nombre(c.get("staff") or {}) or None
    cid = c.get("coach_id")
    if fin_c <= ahora:
      estado_c = "termino"; terminadas += 1
    elif not cid:
      estado_c = "sin_coach"
    elif inicio <= ahora:
      estado_c = "en_clase" if cid in llegaron else "no_ha_llegado"
    elif cid in llegaron:
      estado_c = "llego"
    elif inicio - ahora <= timedelta(minutes=30):
      estado_c = "no_ha_llegado"
    else:
      estado_c = "mas_tarde"
    reservas = supabase.table("reservas").select("id", count="exact", head=True)\
      .eq("clase_id", c["id"]).neq("estatus", "Cancelada").eq("lista_espera", False).execute().count or 0
    item = {"id": c["id"], "nombre": (c.get("nombre_clase") or "").strip(), "horario": c["horario"],
            "duracion": c.get("duracion_minutos") or 60, "cupo": c.get("capacidad_max") or 0,
            "reservas": reservas, "coach": coach, "estado": estado_c}
    lista.append(item)
    if estado_c == "no_ha_llegado":
      alertas.append({"tipo": "coach_no_llega", "coach": coach, "clase": item["nombre"], "horario": c["horario"]})
    if estado_c == "sin_coach" and inicio - ahora <= timedelta(hours=2):
      alertas.append({"tipo": "sin_coach", "coach": None, "clase": item["nombre"], "horario": c["horario"]})

  # Movimientos del día (checadas ya revisadas + intentos rechazados), más reciente primero
  movimientos = []
  for c in checadas:
    if c["estado"] == "pendiente":
      continue
    movimientos.append({"id": c["id"], "hora": c["registrado_at"], "nombre": _nombre(c.get("staff") or {}),
                        "tipo": c["tipo"], "estado": c["estado"], "motivo": c.get("motivo")})
  for i in intentos:
    movimientos.append({"id": i["id"], "hora": i["created_at"], "nombre": _nombre(i.get("staff") or {}),
                        "tipo": "intento", "estado": i["motivo"], "motivo": i.get("detalle")})
  movimientos.sort(key=lambda m: m["hora"], reverse=True)

  lista_adentro = sorted(adentro.values(), key=lambda a: a["desde"])
  return {
    "kpis": {
      "adentro": len(lista_adentro),
      "adentro_coaches": sum(1 for a in lista_adentro if a["es_coach"]),
      "adentro_staff": sum(1 for a in lista_adentro if not a["es_coach"]),
      "entradas": entradas, "salidas": salidas,
      "clases": len(lista), "clases_terminadas": terminadas,
      "rechazos": len(intentos),
      "rechazo_ejemplo": ({"nombre": _nombre(intentos[0].get("staff") or {}), "motivo": intentos[0]["motivo"]}
                          if intentos else None),
    },
    "alertas": alertas,
    "clases": lista,
    "adentro": lista_adentro,
    "movimientos": movimientos[:25],
    "ultima_entrada": ultima,
  }


class Confirmar(BaseModel):
  checada_id: str
  accion: str                  # "confirmar" | "rechazar"
  motivo: str | None = None


@router.post("/confirmar")
async def confirmar(body: Confirmar, request: Request):
  fila = supabase.table("checadas").select("id, staff_id, sucursal_id, estado").eq("id", body.checada_id).limit(1).execute().data
  if not fila:
    raise HTTPException(status_code=404, detail="Esa checada ya no existe.")
  ch = fila[0]
  s = _operador(request, ch["sucursal_id"])
  if ch["staff_id"] == s["id"]:
    raise HTTPException(status_code=403, detail="Nadie puede confirmar su propia entrada. Pídeselo a otra persona de Front Desk.")
  if ch["estado"] != "pendiente":
    raise HTTPException(status_code=409, detail="Esta entrada ya fue revisada.")
  if body.accion not in ("confirmar", "rechazar"):
    raise HTTPException(status_code=400, detail="Acción inválida.")
  if body.accion == "rechazar" and not (body.motivo or "").strip():
    raise HTTPException(status_code=400, detail="Escribe por qué la rechazas.")

  cambios = {
    "estado": "confirmada" if body.accion == "confirmar" else "rechazada",
    "confirmado_por": s["id"], "confirmado_at": _ahora().isoformat(),
  }
  if body.accion == "rechazar":
    cambios["motivo"] = body.motivo.strip()
  r = supabase.table("checadas").update(cambios).eq("id", ch["id"]).eq("estado", "pendiente").execute()
  if not r.data:
    raise HTTPException(status_code=409, detail="Alguien más ya la revisó.")
  return {"ok": True, "estado": cambios["estado"]}


# ══════════════════════════════════════════════════════════════════════════════
# Celular del staff: escanear y consultar estado
# ══════════════════════════════════════════════════════════════════════════════

class Escaneo(BaseModel):
  codigo: str
  latitud: float | None = None
  longitud: float | None = None
  precision_m: float | None = None


def _intento(s: dict, sucursal_id: str | None, motivo: str, detalle: str, request: Request,
             esc: Escaneo | None = None, distancia: float | None = None):
  supabase.table("checadas_intentos").insert({
    "staff_id": s["id"] if s else None, "sucursal_id": sucursal_id, "motivo": motivo, "detalle": detalle,
    "latitud": esc.latitud if esc else None, "longitud": esc.longitud if esc else None,
    "distancia_m": distancia, "ip": _ip(request),
    "user_agent": (request.headers.get("user-agent") or "")[:300],
  }).execute()


def _rechazo(motivo: str, titulo: str, mensaje: str, **extra):
  return {"ok": False, "motivo": motivo, "titulo": titulo, "mensaje": mensaje, **extra}


@router.post("/escanear")
async def escanear(body: Escaneo, request: Request):
  s = _staff(request)

  # 1. El código: existe, no se ha usado y no ha vencido. Se quema en este momento.
  cod = supabase.table("checador_codigos").select("id, sucursal_id, expira_at, usado_at")\
    .eq("codigo_hash", _hash(body.codigo.strip())).limit(1).execute().data
  if not cod:
    _intento(s, None, "codigo_invalido", "Código inexistente", request, body)
    return _rechazo("codigo_invalido", "Código no válido", "Escanea el QR de la pantalla de Front Desk.")
  cod = cod[0]
  suc_id = cod["sucursal_id"]
  if cod.get("usado_at"):
    _intento(s, suc_id, "codigo_usado", "El QR ya se había usado", request, body)
    return _rechazo("codigo_usado", "Ese QR ya se usó", "Escanea el código que aparece ahora en Front Desk.")
  if _dt(cod["expira_at"]) < _ahora():
    _intento(s, suc_id, "codigo_vencido", "El QR ya había vencido", request, body)
    return _rechazo("codigo_vencido", "El QR ya cambió", "Escanea el código que aparece ahora en Front Desk.")
  quemado = supabase.table("checador_codigos").update({"usado_at": _ahora().isoformat(), "usado_por": s["id"]})\
    .eq("id", cod["id"]).is_("usado_at", "null").execute().data
  if not quemado:
    _intento(s, suc_id, "codigo_usado", "Otro celular lo usó primero", request, body)
    return _rechazo("codigo_usado", "Ese QR ya se usó", "Escanea el código que aparece ahora en Front Desk.")

  suc = supabase.table("sucursales").select("id, nombre, latitud, longitud").eq("id", suc_id).single().execute().data

  # 2. Ubicación (si la validación está apagada, solo se guarda la distancia para verla en Front Desk)
  if VALIDAR_UBICACION and (body.latitud is None or body.longitud is None):
    _intento(s, suc_id, "sin_ubicacion", "El celular no mandó ubicación", request, body)
    return _rechazo("sin_ubicacion", "Activa tu ubicación", "Para checar necesitamos saber que estás en la sucursal.")
  distancia = None
  if body.latitud is not None and body.longitud is not None and suc.get("latitud") is not None and suc.get("longitud") is not None:
    distancia = round(_distancia_m(body.latitud, body.longitud, suc["latitud"], suc["longitud"]))
    margen = min(body.precision_m or 0, 150)                  # el GPS adentro de un edificio falla unos metros
    if VALIDAR_UBICACION and distancia - margen > RADIO_M:
      _intento(s, suc_id, "lejos", f"A {distancia} m de la sucursal", request, body, distancia)
      return _rechazo("lejos", f"Estás a {distancia / 1000:.1f} km de {suc['nombre']}",
                      "Tienes que checar en Front Desk.", distancia_m=distancia, sucursal=suc["nombre"])

  ini, _ = _dia_cdmx()
  base = {
    "staff_id": s["id"], "sucursal_id": suc_id, "codigo_id": cod["id"],
    "latitud": body.latitud, "longitud": body.longitud, "precision_m": body.precision_m,
    "distancia_m": distancia, "ip": _ip(request), "user_agent": (request.headers.get("user-agent") or "")[:300],
  }

  # 3. ¿Ya está adentro? Entonces esto es su salida.
  ultima = supabase.table("checadas").select("id, tipo, estado, registrado_at")\
    .eq("staff_id", s["id"]).eq("sucursal_id", suc_id).gte("registrado_at", ini.isoformat())\
    .neq("estado", "rechazada").order("registrado_at", desc=True).limit(1).execute().data
  if ultima and ultima[0]["tipo"] == "entrada":
    if ultima[0]["estado"] == "pendiente":
      return {"ok": True, "tipo": "entrada", "estado": "pendiente", "checada_id": ultima[0]["id"],
              "nombre": s.get("nombre"), "sucursal": suc["nombre"]}
    sal = supabase.table("checadas").insert({**base, "tipo": "salida", "estado": "confirmada"}).execute().data[0]
    entrada = _dt(ultima[0]["registrado_at"])
    minutos = int((_dt(sal["registrado_at"]) - entrada).total_seconds() // 60)
    return {"ok": True, "tipo": "salida", "estado": "confirmada", "checada_id": sal["id"],
            "nombre": s.get("nombre"), "sucursal": suc["nombre"],
            "entrada": ultima[0]["registrado_at"], "salida": sal["registrado_at"], "minutos": minutos}

  # 4. Entrada: ¿le toca?
  dia_asignado, salida_prog = None, None
  if _es_coach(s):
    clases = _clases_hoy(s["id"], suc_id)
    if not clases:
      _intento(s, suc_id, "sin_clases", "No tiene clases hoy en esta sucursal", request, body, distancia)
      return _rechazo("sin_clases", f"No tienes clases hoy en {suc['nombre']}",
                      "No se registró tu entrada.", sucursal=suc["nombre"])
    primera = _dt(clases[0]["horario"])
    ultima_fin = max(_dt(c["horario"]) + timedelta(minutes=c["duracion"]) for c in clases)
    ahora = _ahora()
    if ahora < primera - timedelta(minutes=VENTANA_ANTES_MIN):
      _intento(s, suc_id, "fuera_de_ventana", "Demasiado temprano", request, body, distancia)
      desde = (primera - timedelta(minutes=VENTANA_ANTES_MIN)).astimezone(CDMX).strftime("%H:%M")
      return _rechazo("fuera_de_ventana", "Todavía es muy temprano",
                      f"Puedes checar a partir de las {desde}.", sucursal=suc["nombre"])
    if ahora > ultima_fin:
      _intento(s, suc_id, "fuera_de_ventana", "Sus clases de hoy ya terminaron", request, body, distancia)
      return _rechazo("fuera_de_ventana", "Tus clases de hoy ya terminaron", "No se registró tu entrada.",
                      sucursal=suc["nombre"])
  else:
    # Staff, managers y dirección: parejo, solo con turno ese día (horario de la quincena o fijo)
    bloques = bloques_del_dia(s["id"], suc_id, _ahora().astimezone(CDMX).date())
    if not bloques:
      prox = _proximo_turno(s["id"], suc_id)
      _intento(s, suc_id, "sin_turno", "No tiene turno hoy en su horario", request, body, distancia)
      return _rechazo("sin_turno", "Hoy no tienes turno",
                      f"Hoy no apareces en el horario de {suc['nombre']}. Si vienes a cubrir a alguien, pídele a tu Manager que registre tu entrada."
                      + (f" Tu próximo turno: {prox}." if prox else ""), sucursal=suc["nombre"], proximo_turno=prox)
    ahora = _ahora()
    primera_entrada = _hora_hoy(bloques[0][0])
    ultima_salida = _hora_hoy(bloques[-1][1])
    if ahora < primera_entrada - timedelta(minutes=VENTANA_TURNO_MIN):
      _intento(s, suc_id, "fuera_de_ventana", "Demasiado temprano para su turno", request, body, distancia)
      desde = (primera_entrada - timedelta(minutes=VENTANA_TURNO_MIN)).astimezone(CDMX).strftime("%H:%M")
      return _rechazo("fuera_de_ventana", "Todavía es muy temprano",
                      f"Tu turno empieza a las {bloques[0][0]}. Puedes checar a partir de las {desde}.", sucursal=suc["nombre"])
    if ahora > ultima_salida:
      _intento(s, suc_id, "fuera_de_ventana", "Su turno de hoy ya terminó", request, body, distancia)
      return _rechazo("fuera_de_ventana", "Tu turno de hoy ya terminó",
                      f"Tu turno era hasta las {bloques[-1][1]}. No se registró tu entrada.", sucursal=suc["nombre"])
    dia_asignado, salida_prog = _turno_de_hoy(s["id"], suc_id)

  # El primero de Front Desk / gerencia que llega no tiene quién lo confirme: se confirma solo
  estado_ini, motivo_ini = "pendiente", None
  if _puede_operar(s) and not [x for x in _adentro_hoy(suc_id) if x != s["id"]]:
    otros_operadores = supabase.table("checadas").select("staff_id, staff:staff_id(tipo, rol)")\
      .eq("sucursal_id", suc_id).gte("registrado_at", ini.isoformat()).eq("tipo", "entrada")\
      .eq("estado", "pendiente").neq("staff_id", s["id"]).execute().data or []
    if not otros_operadores:
      estado_ini, motivo_ini = "automatica", "Primera entrada de Front Desk / gerencia: nadie más para confirmar"

  ent = supabase.table("checadas").insert({
    **base, "tipo": "entrada", "estado": estado_ini, "motivo": motivo_ini, "dia_asignado": dia_asignado,
    "salida_programada": salida_prog.isoformat() if salida_prog else None,
  }).execute().data[0]
  return {"ok": True, "tipo": "entrada", "estado": "confirmada" if estado_ini == "automatica" else "pendiente",
          "checada_id": ent["id"], "nombre": s.get("nombre"), "sucursal": suc["nombre"]}


@router.get("/estado/{checada_id}")
async def estado(checada_id: str, request: Request):
  s = _staff(request)
  fila = supabase.table("checadas").select("id, staff_id, sucursal_id, tipo, estado, registrado_at, motivo, confirmado_por, sucursales(nombre)")\
    .eq("id", checada_id).limit(1).execute().data
  if not fila or fila[0]["staff_id"] != s["id"]:
    raise HTTPException(status_code=404, detail="No encontramos tu checada.")
  ch = fila[0]
  out = {"checada_id": ch["id"], "tipo": ch["tipo"], "estado": ch["estado"], "hora": ch["registrado_at"],
         "nombre": s.get("nombre"), "sucursal": (ch.get("sucursales") or {}).get("nombre")}
  if ch["estado"] == "rechazada":
    out["motivo"] = ch.get("motivo")
  if ch.get("confirmado_por"):
    quien = supabase.table("staff").select("nombre").eq("id", ch["confirmado_por"]).limit(1).execute().data
    out["confirmado_por"] = (quien[0].get("nombre") or "").strip().split(" ")[0] if quien else None
  if ch["estado"] == "automatica" and ch["tipo"] == "entrada":
    out["estado"] = "confirmada"
  if out["estado"] == "confirmada" and ch["tipo"] == "entrada":
    out.update(_vista_del_dia(s, ch["sucursal_id"], ch["id"]))
  return out


def _vista_del_dia(s: dict, sucursal_id: str, checada_id: str) -> dict:
  """Coach: sus clases con alumnos. Staff: su turno y lo que pasa hoy en la sucursal."""
  if _es_coach(s):
    ini_q, fin_q = _quincena()
    dadas = supabase.table("clases_impartidas").select("id", count="exact", head=True)\
      .eq("coach_id", s["id"]).eq("estado", "impartida")\
      .gte("horario", ini_q.isoformat()).lt("horario", fin_q.isoformat()).execute().count or 0
    return {"vista": "coach", "clases": _clases_hoy(s["id"], sucursal_id, con_alumnos=True),
            "quincena": {"clases": dadas}}
  ch = supabase.table("checadas").select("registrado_at, salida_programada").eq("id", checada_id).single().execute().data
  return {
    "vista": "staff",
    "turno": {"entrada": ch["registrado_at"], "salida_programada": ch.get("salida_programada")},
    "sucursal_hoy": _sucursal_hoy(sucursal_id),
    "quincena": _quincena_staff(s["id"]),
  }


@router.get("/hoy")
async def hoy(request: Request):
  """Para abrir la página del checador sin escanear: ¿estoy adentro? y mis clases de hoy."""
  s = _staff(request)
  ini, _ = _dia_cdmx()
  ultima = supabase.table("checadas").select("id, sucursal_id, tipo, estado, registrado_at, sucursales(nombre)")\
    .eq("staff_id", s["id"]).gte("registrado_at", ini.isoformat()).neq("estado", "rechazada")\
    .order("registrado_at", desc=True).limit(1).execute().data
  u = ultima[0] if ultima else None
  adentro = bool(u and u["tipo"] == "entrada" and u["estado"] in ("confirmada", "automatica", "manual"))
  out = {
    "nombre": s.get("nombre"), "adentro": adentro,
    "checada_id": u["id"] if u else None,
    "hora": u["registrado_at"] if u else None,
    "estado": ("confirmada" if u and u["estado"] in ("automatica", "manual") else (u["estado"] if u else None)),
    "sucursal": (u.get("sucursales") or {}).get("nombre") if u else None,
  }
  if adentro:
    out.update(_vista_del_dia(s, u["sucursal_id"], u["id"]))
  return out


# ══════════════════════════════════════════════════════════════════════════════
# Procesos programados
# ══════════════════════════════════════════════════════════════════════════════

def _tarifa(sucursal_id: str, nivel: str | None, duracion: int, tipo_clase: str | None, fecha: str):
  """La regla más específica: sucursal > todas, duración exacta > cualquiera, tipo exacto > cualquiera,
  por_clase > por_hora, y la vigencia más reciente. Regresa (regla, monto de la clase)."""
  if not nivel:
    return None, 0
  filas = supabase.table("tarifas_coach")\
    .select("id, sucursal_id, nivel, duracion_minutos, tipo_clase, modo, monto, vigente_desde")\
    .eq("nivel", nivel).eq("activo", True).lte("vigente_desde", fecha).execute().data or []
  tipo = (tipo_clase or "").strip().lower()
  validas = [t for t in filas
             if t.get("sucursal_id") in (None, sucursal_id)
             and t.get("duracion_minutos") in (None, duracion)
             and (not t.get("tipo_clase") or t["tipo_clase"].strip().lower() == tipo)]
  if not validas:
    return None, 0
  validas.sort(key=lambda t: (t.get("sucursal_id") is not None, t.get("duracion_minutos") is not None,
                              bool(t.get("tipo_clase")), t["modo"] == "por_clase", t["vigente_desde"]), reverse=True)
  t = validas[0]
  monto = float(t["monto"]) if t["modo"] == "por_clase" else float(t["monto"]) * duracion / 60
  return t, round(monto, 2)


def _bonos(c: dict, nivel: str | None, asistentes: int, duracion: int, inicio: datetime) -> tuple[float, list]:
  """Aplica las reglas de bono que cumpla la clase. Las acumulables se suman; de las demás, solo la más alta.
  Regresa (monto total, detalle)."""
  local = inicio.astimezone(CDMX)
  fecha = local.date().isoformat()
  reglas = supabase.table("reglas_bono").select("*").eq("activo", True).lte("vigente_desde", fecha).execute().data or []
  cupo = c.get("capacidad_max") or 0
  ocupacion = (asistentes / cupo * 100) if cupo else 0
  tipo = (c.get("tipo_clase") or "").strip().lower()
  hora = local.strftime("%H:%M")
  dia = local.isoweekday() % 7
  cumplen = []
  for r in reglas:
    if r.get("vigente_hasta") and r["vigente_hasta"] < fecha: continue
    if r.get("niveles") and (nivel or "") not in r["niveles"]: continue
    if r.get("sucursal_ids") and c["sucursal_id"] not in r["sucursal_ids"]: continue
    if r.get("tipos_clase") and tipo not in [t.strip().lower() for t in r["tipos_clase"]]: continue
    if r.get("duraciones") and duracion not in r["duraciones"]: continue
    if r.get("dias_semana") and dia not in r["dias_semana"]: continue
    if r.get("hora_desde") and hora < r["hora_desde"][:5]: continue
    if r.get("hora_hasta") and hora >= r["hora_hasta"][:5]: continue
    if r.get("min_asistentes") is not None and asistentes < r["min_asistentes"]: continue
    if r.get("min_ocupacion_pct") is not None and ocupacion < r["min_ocupacion_pct"]: continue
    cumplen.append(r)
  acumulables = [r for r in cumplen if r.get("acumulable")]
  otras = sorted([r for r in cumplen if not r.get("acumulable")], key=lambda r: float(r["monto"]), reverse=True)
  aplicadas = acumulables + otras[:1]
  detalle = [{"regla_id": r["id"], "nombre": r["nombre"], "monto": float(r["monto"])} for r in aplicadas]
  return round(sum(d["monto"] for d in detalle), 2), detalle


def _evaluar_clase(c: dict) -> dict:
  """Calcula qué se le paga al coach por esta clase y en qué estado queda."""
  dur = c.get("duracion_minutos") or 60
  inicio = _dt(c["horario"])
  fin = inicio + timedelta(minutes=dur)
  fecha = inicio.astimezone(CDMX).date().isoformat()
  fila = {
    "clase_id": c["id"], "coach_id": c.get("coach_id"), "sucursal_id": c["sucursal_id"],
    "horario": c["horario"], "nombre_clase": (c.get("nombre_clase") or "").strip(), "duracion_minutos": dur,
    "nivel_coach": None, "tipo_pago_coach": None, "tarifa_id": None, "tarifa_hora": None, "tarifa_modo": None,
    "monto_clase": 0, "asistentes": 0, "bono_id": None, "bono": 0, "total": 0,
    "estado": "revisar", "checada_id": None, "motivo_estado": None,
    "bonos_detalle": [], "porcentaje_pago": 100, "es_suplencia": False,
  }

  nombre = fila["nombre_clase"].lower()
  if "open gym" in nombre:
    return {**fila, "estado": "no_aplica", "motivo_estado": "Open Gym: se paga por hora al Coach de Piso"}
  if not c.get("coach_id"):
    return {**fila, "motivo_estado": "Clase sin coach asignado"}

  coach = supabase.table("staff").select("id, nivel, tipo_pago").eq("id", c["coach_id"]).single().execute().data
  fila.update({"nivel_coach": coach.get("nivel"), "tipo_pago_coach": coach.get("tipo_pago")})
  if coach.get("tipo_pago") == "Por hora":
    return {**fila, "estado": "no_aplica", "motivo_estado": "El coach cobra por hora, no por clase"}

  # Asistentes reales (con check-in), no reservas
  asis = supabase.table("asistencias").select("cliente_id").eq("clase_id", c["id"]).execute().data or []
  fila["asistentes"] = len({a.get("cliente_id") for a in asis if a.get("cliente_id")}) or len(asis)

  # Entrada confirmada del coach antes de inicio + tolerancia, y sin salida antes de que termine
  ini_dia, fin_dia = _dia_cdmx(inicio)
  checadas = supabase.table("checadas").select("id, tipo, estado, registrado_at")\
    .eq("staff_id", c["coach_id"]).eq("sucursal_id", c["sucursal_id"])\
    .gte("registrado_at", ini_dia.isoformat()).lt("registrado_at", fin_dia.isoformat())\
    .order("registrado_at").execute().data or []
  limite = inicio + timedelta(minutes=TOLERANCIA_MIN)
  entrada = None
  for ch in checadas:
    t = _dt(ch["registrado_at"])
    if ch["tipo"] == "entrada" and ch["estado"] in ("confirmada", "automatica", "manual") and t <= limite:
      entrada = ch
    elif ch["tipo"] == "salida" and entrada and _dt(entrada["registrado_at"]) < t < fin and ch["estado"] != "automatica":
      entrada = None                                         # salió antes de que terminara la clase
  pendiente = any(ch["tipo"] == "entrada" and ch["estado"] == "pendiente" for ch in checadas)
  tarde = any(ch["tipo"] == "entrada" and ch["estado"] in ("confirmada", "automatica", "manual") and _dt(ch["registrado_at"]) > limite
              for ch in checadas)

  tarifa, monto = _tarifa(c["sucursal_id"], coach.get("nivel"), dur, c.get("tipo_clase"), fecha)

  # Suplencia: el que cubre cobra la tarifa normal, sin bono
  cambio = supabase.table("cambios_coach").select("coach_antes, coach_despues").eq("clase_id", c["id"])\
    .order("created_at", desc=True).limit(1).execute().data
  fila["es_suplencia"] = bool(cambio and cambio[0].get("coach_despues") == c["coach_id"] and cambio[0].get("coach_antes"))

  if fila["es_suplencia"]:
    total_bono, detalle = 0.0, []
  else:
    total_bono, detalle = _bonos(c, coach.get("nivel"), fila["asistentes"], dur, inicio)
  fila.update({"bono": total_bono, "bonos_detalle": detalle})

  # Clase sin alumnos (nadie hizo check-in): se paga el 50% y sin bono
  if fila["asistentes"] == 0:
    fila.update({"porcentaje_pago": 50, "bono": 0, "bonos_detalle": []})
  if tarifa:
    fila.update({"tarifa_id": tarifa["id"], "tarifa_hora": tarifa["monto"], "tarifa_modo": tarifa["modo"],
                 "monto_clase": round(monto * fila["porcentaje_pago"] / 100, 2)})
  fila["total"] = round(fila["monto_clase"] + fila["bono"], 2)

  if entrada:
    fila["checada_id"] = entrada["id"]
    if not tarifa:
      return {**fila, "motivo_estado": f"Sin tarifa para nivel {coach.get('nivel') or '(vacío)'} y {dur} min en esta sucursal"}
    motivo = []
    if fila["porcentaje_pago"] < 100: motivo.append("Sin alumnos: se paga el 50%")
    if fila["es_suplencia"]: motivo.append("Suplencia: tarifa normal sin bono")
    return {**fila, "estado": "impartida", "motivo_estado": " · ".join(motivo) or None}
  if pendiente:
    return {**fila, "motivo_estado": "Su entrada sigue pendiente de confirmar en Front Desk"}
  if tarde:
    return {**fila, "motivo_estado": f"Checó más de {TOLERANCIA_MIN} min después del inicio"}
  if any(ch["tipo"] == "salida" for ch in checadas):
    return {**fila, "motivo_estado": "Hizo salida antes de que terminara la clase"}
  return {**fila, "estado": "sin_checar", "motivo_estado": "El coach no checó entrada ese día"}


async def generar_clases_impartidas():
  """Cada 10 min: evalúa las clases que terminaron hace 30+ min (últimos 3 días).
  Las ya impartidas o resueltas por un gerente no se tocan; las demás se recalculan."""
  ahora = _ahora()
  desde = (ahora - timedelta(days=3)).isoformat()
  clases = supabase.table("clases")\
    .select("id, coach_id, sucursal_id, horario, duracion_minutos, nombre_clase, tipo_clase, estado, capacidad_max")\
    .gte("horario", desde).lte("horario", ahora.isoformat()).neq("estado", "Cancelada")\
    .execute().data or []
  listas = [c for c in clases
            if _dt(c["horario"]) + timedelta(minutes=(c.get("duracion_minutos") or 60) + 30) <= ahora]
  if not listas:
    return

  existentes = {}
  ids = [c["id"] for c in listas]
  for i in range(0, len(ids), 200):
    for f in supabase.table("clases_impartidas").select("clase_id, estado, resuelto_por")\
        .in_("clase_id", ids[i:i + 200]).execute().data or []:
      existentes[f["clase_id"]] = f

  n = 0
  for c in listas:
    prev = existentes.get(c["id"])
    if prev and (prev["estado"] == "impartida" or prev.get("resuelto_por")):
      continue                                               # congelada
    try:
      fila = _evaluar_clase(c)
      if prev and prev["estado"] == fila["estado"] == "no_aplica":
        continue
      supabase.table("clases_impartidas").upsert(fila, on_conflict="clase_id").execute()
      n += 1
    except Exception as e:
      print(f"⚠️ clase impartida {c['id']}: {e}")
  if n:
    print(f"🧾 Clases impartidas evaluadas: {n}")


async def cerrar_salidas_olvidadas():
  """Coach: si no hizo salida, se cierra al terminar su última clase del día en esa sucursal.
  Staff sin clases: a las 23:30 CDMX se cierra como 'automatica' para que el gerente la revise."""
  ahora = _ahora()
  ayer = (ahora - timedelta(days=2)).isoformat()
  entradas = supabase.table("checadas").select("id, staff_id, sucursal_id, registrado_at, salida_programada, staff:staff_id(tipo_pago)")\
    .eq("tipo", "entrada").in_("estado", ["confirmada", "automatica", "manual"]).gte("registrado_at", ayer)\
    .execute().data or []

  for e in entradas:
    t_ent = _dt(e["registrado_at"])
    ini_dia, fin_dia = _dia_cdmx(t_ent)
    hay_salida = supabase.table("checadas").select("id").eq("staff_id", e["staff_id"]).eq("sucursal_id", e["sucursal_id"])\
      .eq("tipo", "salida").gt("registrado_at", e["registrado_at"]).lt("registrado_at", fin_dia.isoformat())\
      .limit(1).execute().data
    if hay_salida:
      continue

    cierre, gracia = None, timedelta(minutes=10)
    if e.get("salida_programada"):                              # staff con horario: su hora de salida
      cierre, gracia = _dt(e["salida_programada"]), timedelta(minutes=GRACIA_SALIDA_MIN)
    elif ((e.get("staff") or {}).get("tipo_pago") or "") == "Por clase":
      clases = supabase.table("clases").select("horario, duracion_minutos")\
        .eq("coach_id", e["staff_id"]).eq("sucursal_id", e["sucursal_id"])\
        .gte("horario", ini_dia.isoformat()).lt("horario", fin_dia.isoformat()).neq("estado", "Cancelada")\
        .execute().data or []
      if clases:
        cierre = max(_dt(c["horario"]) + timedelta(minutes=c.get("duracion_minutos") or 60) for c in clases)
    if cierre is None:
      cierre = (ini_dia + timedelta(hours=23, minutes=30)).astimezone(timezone.utc)
    if cierre + gracia > ahora:
      continue

    supabase.table("checadas").insert({
      "staff_id": e["staff_id"], "sucursal_id": e["sucursal_id"], "tipo": "salida",
      "estado": "automatica", "registrado_at": cierre.isoformat(),
      "motivo": "Salida automática: no checó al irse",
    }).execute()