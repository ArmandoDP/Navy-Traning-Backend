# routers/metas.py  →  prefijo /metas
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Request
from services.supabase import supabase
from services import metas as M

router = APIRouter()


def _cliente(request: Request) -> dict:
  auth = request.headers.get("authorization", "")
  if not auth.lower().startswith("bearer "):
    raise HTTPException(status_code=401, detail="Sesión requerida")
  try:
    user = supabase.auth.get_user(auth[7:]).user
  except Exception:
    raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
  r = supabase.table("clientes").select("id, nombre_completo, sucursal_id").eq("supabase_user_id", user.id).limit(1).execute().data
  if not r and user.email:
    r = supabase.table("clientes").select("id, nombre_completo, sucursal_id").ilike("email", user.email.strip()).limit(1).execute().data
  if not r:
    raise HTTPException(status_code=404, detail="Cliente no encontrado")
  return r[0]


def _activa(cliente_id: str) -> dict | None:
  r = supabase.table("cliente_metas").select("*").eq("cliente_id", cliente_id).eq("estatus", "Activa").limit(1).execute().data
  return r[0] if r else None


@router.get("/catalogo")
async def catalogo():
  metas = supabase.table("metas").select("*").eq("activa", True).order("orden").execute().data or []
  split = supabase.table("meta_split").select("*").execute().data or []
  for m in metas:
    m["split"] = {s["dia_semana"]: s["tipo_clase"] for s in split if s["meta_id"] == m["id"]}
  return {"metas": metas}


@router.get("/mia")
async def mia(request: Request):
  cli = _cliente(request)
  cm = _activa(cli["id"])
  if cm:
    cm = await M.evaluar(cm)
  estadisticas = _estadisticas(cli["id"])
  historial = supabase.table("cliente_metas").select("id, estatus, created_at, completada_at, semanas_cumplidas, mejor_racha, metas(nombre, emoji)")\
    .eq("cliente_id", cli["id"]).neq("estatus", "Activa").order("created_at", desc=True).limit(10).execute().data or []

  # Eventos sin ver (incluye el de una meta que se acaba de completar)
  ids = [cm["id"]] if cm else []
  ids += [h["id"] for h in historial[:1]]
  eventos = supabase.table("meta_eventos").select("*").in_("cliente_meta_id", ids).eq("visto", False)\
    .order("created_at").execute().data if ids else []

  if not cm or cm["estatus"] != "Activa":
    return {"meta": None, "estadisticas": estadisticas, "historial": historial, "eventos": eventos or []}

  meta = supabase.table("metas").select("*").eq("id", cm["meta_id"]).single().execute().data
  split = {s["dia_semana"]: s["tipo_clase"] for s in
           (supabase.table("meta_split").select("*").eq("meta_id", cm["meta_id"]).execute().data or [])}
  ini = date.fromisoformat(cm["semana_inicio"])
  dias_db = {d["fecha"]: d for d in M.dias_semana(cm)}
  h = M.hoy()

  semana = []
  for n in range(1, 8):
    f = ini + timedelta(days=n - 1)
    d = dias_db.get(f.isoformat())
    item = {"dia_semana": n, "fecha": f.isoformat(), "tipo": split.get(n), "toca": n in cm["dias"],
            "estatus": d["estatus"] if d else ("Descanso" if n not in cm["dias"] else "Pendiente"),
            "es_hoy": f == h, "clase": None}
    if d and d.get("clase_id"):
      c = supabase.table("clases").select("nombre_clase, horario, sucursales(nombre), staff(nombre, primer_apellido)")\
        .eq("id", d["clase_id"]).limit(1).execute().data
      if c:
        item["clase"] = {**c[0], "hora": M.hora(c[0]["horario"])}
    semana.append(item)

  # La siguiente clase que le toca (hoy o después) y si ya la reservó
  siguiente = next((x for x in semana if x["toca"] and x["fecha"] >= h.isoformat()
                    and x["estatus"] in ("Pendiente", "Reservado")), None)
  if siguiente and siguiente["estatus"] == "Pendiente":
    siguiente["disponibles"] = [
      {"id": c["id"], "nombre": c["nombre_clase"], "hora": M.hora(c["horario"]), "libres": c["libres"],
       "sucursal": (c.get("sucursales") or {}).get("nombre"),
       "coach": f"{(c.get('staff') or {}).get('nombre', '')} {((c.get('staff') or {}).get('primer_apellido') or '')[:1]}.".strip()}
      for c in M.clases_del_dia(date.fromisoformat(siguiente["fecha"]), siguiente["tipo"], cli.get("sucursal_id"),
                                solo_futuras=True, con_lugar=True)[:4]
    ]

  return {
    "meta": {
      **cm, "nombre": meta["nombre"], "enfoque": meta["enfoque"], "explicacion": meta["explicacion"],
      "emoji": meta["emoji"], "color": meta["color"], "semanas": meta["semanas"],
      "fase": M.fase(cm["semana_numero"]), "split": split,
    },
    "semana": semana, "siguiente": siguiente,
    "estadisticas": estadisticas, "historial": historial, "eventos": eventos or [],
  }


def _estadisticas(cliente_id: str) -> dict:
  """Para la pestaña Mi progreso."""
  asist = supabase.table("asistencias").select("fecha_checkin, clases(nombre_clase, duracion_minutos)")\
    .eq("cliente_id", cliente_id).order("fecha_checkin", desc=True).limit(1000).execute().data or []
  h = M.hoy()
  por_tipo = {"HYBRID": 0, "FORCE": 0, "HYROX": 0, "CALISTENIA": 0, "OTRAS": 0}
  minutos, mes, semanas = 0, 0, set()
  ult_8 = {}
  for a in asist:
    f = datetime.fromisoformat(a["fecha_checkin"].replace("Z", "+00:00")).astimezone(M.CDMX).date()
    nombre = (a.get("clases") or {}).get("nombre_clase")
    tipo = next((t for t in M.CLAVES if M.es_tipo(nombre, t)), "OTRAS")
    por_tipo[tipo] += 1
    minutos += (a.get("clases") or {}).get("duracion_minutos") or 0
    if f.year == h.year and f.month == h.month:
      mes += 1
    semanas.add(M.lunes(f))
    semanas_atras = (M.lunes(h) - M.lunes(f)).days // 7
    if 0 <= semanas_atras < 8:
      ult_8[semanas_atras] = ult_8.get(semanas_atras, 0) + 1
  racha_sem, s = 0, M.lunes(h)
  if s not in semanas:
    s -= timedelta(days=7)
  while s in semanas:
    racha_sem += 1
    s -= timedelta(days=7)
  return {
    "total_clases": len(asist), "clases_mes": mes, "horas": round(minutos / 60, 1),
    "semanas_seguidas": racha_sem, "por_tipo": por_tipo,
    "ultimas_8_semanas": [ult_8.get(i, 0) for i in range(7, -1, -1)],   # de la más vieja a la actual
  }


@router.post("/elegir")
async def elegir(request: Request):
  cli = _cliente(request)
  b = await request.json()
  meta = supabase.table("metas").select("*").eq("id", b.get("meta_id")).eq("activa", True).limit(1).execute().data
  if not meta:
    raise HTTPException(status_code=404, detail="Meta no encontrada")
  meta = meta[0]
  dias = sorted({int(d) for d in (b.get("dias") or []) if 1 <= int(d) <= 7})
  if len(dias) < meta["min_dias"] or len(dias) > 6:
    raise HTTPException(status_code=400, detail=f"Elige entre {meta['min_dias']} y 6 días (uno es para descansar).")

  # Si tenía otra meta, se cierra (su historial se conserva)
  supabase.table("cliente_metas").update({"estatus": "Abandonada", "abandonada_at": datetime.now(timezone.utc).isoformat()})\
    .eq("cliente_id", cli["id"]).eq("estatus", "Activa").execute()

  h = M.hoy()
  inicio = M.lunes(h)
  if not any((inicio + timedelta(days=d - 1)) >= h for d in dias):
    inicio += timedelta(days=7)          # esta semana ya no le quedan días: empieza el lunes
  cm = supabase.table("cliente_metas").insert({
    "cliente_id": cli["id"], "meta_id": meta["id"], "dias": dias, "semana_inicio": inicio.isoformat(),
  }).execute().data[0]
  await M.evaluar(cm)
  return {"ok": True, "id": cm["id"], "empieza": inicio.isoformat() if inicio > h else h.isoformat()}


@router.post("/abandonar")
async def abandonar(request: Request):
  cli = _cliente(request)
  supabase.table("cliente_metas").update({"estatus": "Abandonada", "abandonada_at": datetime.now(timezone.utc).isoformat()})\
    .eq("cliente_id", cli["id"]).eq("estatus", "Activa").execute()
  return {"ok": True}


@router.post("/eventos/vistos")
async def eventos_vistos(request: Request):
  cli = _cliente(request)
  b = await request.json()
  ids = [i for i in (b.get("ids") or []) if i]
  if ids:
    mias = [m["id"] for m in (supabase.table("cliente_metas").select("id").eq("cliente_id", cli["id"]).execute().data or [])]
    supabase.table("meta_eventos").update({"visto": True}).in_("id", ids).in_("cliente_meta_id", mias).execute()
  return {"ok": True}