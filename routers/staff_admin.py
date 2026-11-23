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