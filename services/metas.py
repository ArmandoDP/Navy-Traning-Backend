# services/metas.py — metas de entrenamiento (splits NAVY)
#
# Reglas:
#  · La meta son N semanas cumplidas (8 por defecto). Cada semana: ir a la clase que toca en los días que eligió.
#  · Un día cuenta como cumplido con su check-in en una clase del tipo que le tocaba ese día.
#  · Si falla un día: si tiene escudo (y no usó uno esa semana) se protege; si no, SOLO esa semana se reinicia
#    el lunes siguiente. Las semanas ya cumplidas nunca se pierden.
#  · Si ese día no hay clase de su tipo en su sucursal, no cuenta como falla.
#  · Escudos: 1 al empezar, +1 cada 2 semanas cumplidas seguidas, +1 por clase extra (1 por semana). Máximo 2.
from datetime import date, datetime, timedelta, timezone
from services.supabase import supabase
from services.stripe_activacion import push_cliente

CDMX = timezone(timedelta(hours=-6))
MAX_ESCUDOS = 2
CLAVES = {"HYBRID": ["HYBRID"], "FORCE": ["FORCE"], "HYROX": ["HYROX"], "CALISTENIA": ["CALI"]}
NOMBRE_TIPO = {"HYBRID": "HYBRID", "FORCE": "FORCE", "HYROX": "HYROX", "CALISTENIA": "CALISTHENICS"}
DIAS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
FASES = {1: "Construcción", 2: "Construcción", 3: "Construcción", 4: "Descarga",
         5: "Progresión", 6: "Progresión", 7: "Progresión", 8: "Medición"}


# ── Fechas ────────────────────────────────────────────────────────────────────
def hoy() -> date:
  return datetime.now(CDMX).date()

def lunes(d: date) -> date:
  return d - timedelta(days=d.weekday())

def rango_utc(d: date) -> tuple[str, str]:
  ini = datetime.combine(d, datetime.min.time(), tzinfo=CDMX)
  return ini.astimezone(timezone.utc).isoformat(), (ini + timedelta(days=1)).astimezone(timezone.utc).isoformat()

def hora(iso: str) -> str:
  return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(CDMX).strftime("%H:%M")

def fase(semana: int) -> str:
  return FASES.get(((semana - 1) % 8) + 1, "Construcción")

def es_tipo(nombre_clase: str | None, tipo: str) -> bool:
  n = (nombre_clase or "").upper()
  return any(k in n for k in CLAVES.get(tipo, [tipo]))


# ── Clases y reservas ─────────────────────────────────────────────────────────
def clases_del_dia(fecha: date, tipo: str, sucursal_id: str | None, solo_futuras=False, con_lugar=False) -> list[dict]:
  ini, fin = rango_utc(fecha)
  q = supabase.table("clases").select(
      "id, nombre_clase, horario, capacidad_max, espacios_ocupados, sucursal_id, sucursales(nombre), staff(nombre, primer_apellido)")\
    .gte("horario", ini).lt("horario", fin).eq("estado", "Activa").order("horario")
  if sucursal_id:
    q = q.eq("sucursal_id", sucursal_id)
  ahora = datetime.now(timezone.utc).isoformat()
  out = []
  for c in (q.execute().data or []):
    if not es_tipo(c.get("nombre_clase"), tipo):
      continue
    if solo_futuras and c["horario"] <= ahora:
      continue
    libres = (c.get("capacidad_max") or 0) - (c.get("espacios_ocupados") or 0)
    if con_lugar and libres <= 0:
      continue
    out.append({**c, "libres": max(libres, 0)})
  return out


def reserva_del_dia(cliente_id: str, fecha: date, tipo: str) -> dict | None:
  ini, fin = rango_utc(fecha)
  r = supabase.table("reservas").select(
      "id, estatus, clase_id, clases!inner(id, nombre_clase, horario, sucursales(nombre), staff(nombre, primer_apellido))")\
    .eq("cliente_id", cliente_id).gte("clases.horario", ini).lt("clases.horario", fin)\
    .not_.in_("estatus", ["Cancelada", "No Show"]).execute().data or []
  for x in r:
    if es_tipo((x.get("clases") or {}).get("nombre_clase"), tipo):
      return x
  return None


def hizo_checkin(cliente_id: str, reserva: dict) -> bool:
  if reserva.get("estatus") in ("Asistió", "Asistio"):
    return True
  a = supabase.table("asistencias").select("id").eq("cliente_id", cliente_id)\
    .eq("clase_id", reserva["clase_id"]).limit(1).execute().data
  return bool(a)


# ── Eventos (pop-ups en la app) y notificaciones ──────────────────────────────
def evento(cm_id: str, tipo: str, datos: dict):
  supabase.table("meta_eventos").insert({"cliente_meta_id": cm_id, "tipo": tipo, "datos": datos}).execute()


# ── Semana en curso ───────────────────────────────────────────────────────────
def generar_semana(cm: dict, split: dict[int, str]):
  ini = date.fromisoformat(cm["semana_inicio"])
  creada = datetime.fromisoformat(cm["created_at"].replace("Z", "+00:00")).astimezone(CDMX).date()
  filas = []
  for d in sorted(cm["dias"]):
    f = ini + timedelta(days=d - 1)
    if f < creada:
      continue                       # la primera semana empieza el día que eligió la meta
    filas.append({"cliente_meta_id": cm["id"], "fecha": f.isoformat(), "tipo_clase": split[d],
                  "semana_numero": cm["semana_numero"], "intento": cm["intento"]})
  if filas:
    supabase.table("meta_dias").upsert(filas, on_conflict="cliente_meta_id,fecha", ignore_duplicates=True).execute()


def dias_semana(cm: dict) -> list[dict]:
  ini = date.fromisoformat(cm["semana_inicio"])
  return supabase.table("meta_dias").select("*").eq("cliente_meta_id", cm["id"])\
    .gte("fecha", ini.isoformat()).lte("fecha", (ini + timedelta(days=6)).isoformat())\
    .neq("estatus", "Anulado").order("fecha").execute().data or []


def _guardar_dia(d: dict, **cambios):
  cambios["actualizado_at"] = datetime.now(timezone.utc).isoformat()
  supabase.table("meta_dias").update(cambios).eq("id", d["id"]).execute()
  d.update(cambios)


async def evaluar(cm: dict) -> dict:
  """Pone al día una meta activa: reservas, check-ins, días vencidos, semanas y escudos."""
  meta = supabase.table("metas").select("*").eq("id", cm["meta_id"]).single().execute().data
  split = {s["dia_semana"]: s["tipo_clase"] for s in
           (supabase.table("meta_split").select("*").eq("meta_id", cm["meta_id"]).execute().data or [])}
  cli = supabase.table("clientes").select("id, sucursal_id, nombre_completo").eq("id", cm["cliente_id"]).single().execute().data
  cid, suc = cli["id"], cli.get("sucursal_id")
  h = hoy()
  orig = dict(cm)

  for _ in range(12):                                   # por si el cron estuvo detenido varias semanas
    if cm["estatus"] != "Activa":
      break
    generar_semana(cm, split)
    ini = date.fromisoformat(cm["semana_inicio"])
    fin = ini + timedelta(days=6)
    dias = dias_semana(cm)

    # 1. Reservas y check-ins
    for d in dias:
      f = date.fromisoformat(d["fecha"])
      if d["estatus"] not in ("Pendiente", "Reservado") or f > h + timedelta(days=7):
        continue
      r = reserva_del_dia(cid, f, d["tipo_clase"])
      if r and hizo_checkin(cid, r):
        _guardar_dia(d, estatus="Cumplido", reserva_id=r["id"], clase_id=r["clase_id"])
        cm["racha"] += 1
        cm["mejor_racha"] = max(cm["mejor_racha"], cm["racha"])
        cl = r.get("clases") or {}
        evento(cm["id"], "dia_cumplido", {"tipo": d["tipo_clase"], "clase": cl.get("nombre_clase"),
               "hora": hora(cl["horario"]) if cl.get("horario") else None, "racha": cm["racha"],
               "semana": cm["semana_numero"], "dia": DIAS[f.isoweekday()]})
        await push_cliente(cid, "¡Día cumplido! 🔥",
          f"{(cl.get('nombre_clase') or d['tipo_clase']).strip()} ✓ · racha de {cm['racha']}. Vas en la semana {cm['semana_numero']} de {meta['semanas']}.",
          {"tipo": "meta_dia_cumplido"})
      elif r and d["estatus"] == "Pendiente":
        _guardar_dia(d, estatus="Reservado", reserva_id=r["id"], clase_id=r["clase_id"])
      elif not r and d["estatus"] == "Reservado":
        _guardar_dia(d, estatus="Pendiente", reserva_id=None, clase_id=None)   # canceló

    # 2. Clase extra (en un día que no le tocaba): gana un escudo, una vez por semana
    if cm.get("extra_semana") != ini.isoformat() and cm["escudos"] < MAX_ESCUDOS:
      fechas_plan = {d["fecha"] for d in dias}
      a_ini, _ = rango_utc(ini)
      _, a_fin = rango_utc(min(h, fin))
      asist = supabase.table("asistencias").select("fecha_checkin").eq("cliente_id", cid)\
        .gte("fecha_checkin", a_ini).lt("fecha_checkin", a_fin).execute().data or []
      extra = [a for a in asist if datetime.fromisoformat(a["fecha_checkin"].replace("Z", "+00:00"))
               .astimezone(CDMX).date().isoformat() not in fechas_plan]
      if extra:
        cm["escudos"] += 1
        cm["extra_semana"] = ini.isoformat()
        evento(cm["id"], "escudo_ganado", {"razon": "clase_extra", "escudos": cm["escudos"]})
        await push_cliente(cid, "🛡️ ¡Ganaste un escudo!", "Por ir a una clase extra esta semana. Te protege si un día no puedes ir.",
                           {"tipo": "meta_escudo"})

    # 3. Días que ya pasaron sin check-in
    reiniciada = False
    for d in dias:
      f = date.fromisoformat(d["fecha"])
      if f >= h or d["estatus"] not in ("Pendiente", "Reservado"):
        continue
      if not clases_del_dia(f, d["tipo_clase"], suc):
        _guardar_dia(d, estatus="SinClase")
      elif cm["escudos"] > 0 and cm.get("escudo_semana") != ini.isoformat():
        _guardar_dia(d, estatus="Protegido")
        cm["escudos"] -= 1
        cm["escudo_semana"] = ini.isoformat()
        evento(cm["id"], "escudo_usado", {"tipo": d["tipo_clase"], "dia": DIAS[f.isoweekday()], "escudos": cm["escudos"]})
        await push_cliente(cid, "🛡️ Usaste un escudo",
          f"No llegaste a {NOMBRE_TIPO.get(d['tipo_clase'], d['tipo_clase'])} el {DIAS[f.isoweekday()]}, pero tu semana {cm['semana_numero']} sigue en pie. Te quedan {cm['escudos']}.",
          {"tipo": "meta_escudo"})
      else:
        _guardar_dia(d, estatus="Fallado")
        # Solo esta semana vuelve a empezar; lo pendiente de esta semana ya no cuenta
        for x in dias:
          if x["estatus"] in ("Pendiente", "Reservado") and x["id"] != d["id"]:
            _guardar_dia(x, estatus="Anulado")
        cm["racha"] = 0
        cm["semanas_seguidas"] = 0
        cm["semana_inicio"] = (ini + timedelta(days=7)).isoformat()
        cm["intento"] += 1
        evento(cm["id"], "semana_reiniciada", {"tipo": d["tipo_clase"], "dia": DIAS[f.isoweekday()],
               "semana": cm["semana_numero"], "intento": cm["intento"]})
        await push_cliente(cid, "Tu semana vuelve a empezar 💪",
          f"No llegaste a {NOMBRE_TIPO.get(d['tipo_clase'], d['tipo_clase'])} el {DIAS[f.isoweekday()]}. Tu semana {cm['semana_numero']} empieza de nuevo el lunes; lo que ya lograste sigue intacto.",
          {"tipo": "meta_semana_reiniciada"})
        reiniciada = True
        break
    if reiniciada:
      continue

    # 4. ¿Terminó la semana?
    if h > fin:
      cm["semanas_cumplidas"] += 1
      cm["semanas_seguidas"] += 1
      evento(cm["id"], "semana_cumplida", {"semana": cm["semana_numero"], "de": meta["semanas"]})
      if cm["semanas_seguidas"] % 2 == 0 and cm["escudos"] < MAX_ESCUDOS:
        cm["escudos"] += 1
        evento(cm["id"], "escudo_ganado", {"razon": "dos_semanas", "escudos": cm["escudos"]})
      if cm["semanas_cumplidas"] >= meta["semanas"]:
        cm["estatus"] = "Completada"
        cm["completada_at"] = datetime.now(timezone.utc).isoformat()
        evento(cm["id"], "meta_completada", resumen(cm, meta))
        await push_cliente(cid, f"🏆 ¡Completaste tu meta!",
          f"{meta['nombre']}: {meta['semanas']} semanas cumplidas. Abre la app para ver tu resumen.",
          {"tipo": "meta_completada"})
        break
      await push_cliente(cid, f"✅ Semana {cm['semana_numero']} cumplida",
        f"Llevas {cm['semanas_cumplidas']} de {meta['semanas']}. Ya empieza la semana {cm['semana_numero'] + 1}: {fase(cm['semana_numero'] + 1)}.",
        {"tipo": "meta_semana_cumplida"})
      cm["semana_numero"] += 1
      cm["semana_inicio"] = (ini + timedelta(days=7)).isoformat()
      cm["intento"] = 1
      continue
    break

  cambios = {k: cm[k] for k in ("estatus", "semana_numero", "semana_inicio", "intento", "semanas_cumplidas",
             "semanas_seguidas", "escudos", "escudo_semana", "extra_semana", "racha", "mejor_racha", "completada_at")
             if cm.get(k) != orig.get(k)}
  if cambios:
    supabase.table("cliente_metas").update(cambios).eq("id", cm["id"]).execute()
  return cm


def resumen(cm: dict, meta: dict) -> dict:
  """Recap de la meta: lo que se muestra al terminar."""
  dias = supabase.table("meta_dias").select("tipo_clase, estatus").eq("cliente_meta_id", cm["id"]).execute().data or []
  cumplidos = [d for d in dias if d["estatus"] == "Cumplido"]
  fallados  = sum(1 for d in dias if d["estatus"] == "Fallado")
  por_tipo: dict[str, int] = {}
  for d in cumplidos:
    por_tipo[d["tipo_clase"]] = por_tipo.get(d["tipo_clase"], 0) + 1
  inicio = datetime.fromisoformat(cm["created_at"].replace("Z", "+00:00")).astimezone(CDMX).date()
  return {
    "meta": meta["nombre"], "emoji": meta.get("emoji"), "semanas": meta["semanas"],
    "dias_cumplidos": len(cumplidos), "dias_fallados": fallados,
    "escudos_usados": sum(1 for d in dias if d["estatus"] == "Protegido"),
    "mejor_racha": cm["mejor_racha"], "por_tipo": por_tipo,
    "constancia": round(100 * len(cumplidos) / max(len(cumplidos) + fallados, 1)),
    "semanas_calendario": max(1, ((hoy() - inicio).days // 7) + 1),
  }


# ── Tareas programadas ────────────────────────────────────────────────────────
async def evaluar_todas():
  activas = supabase.table("cliente_metas").select("*").eq("estatus", "Activa").execute().data or []
  for cm in activas:
    try:
      await evaluar(cm)
    except Exception as e:
      print(f"metas evaluar {cm['id']}:", e)
  print(f"🎯 Metas evaluadas: {len(activas)}")


async def recordatorio_noche():
  """20:00 CDMX: si mañana le toca clase y no ha reservado, le avisa con lugares disponibles."""
  manana = hoy() + timedelta(days=1)
  dias = supabase.table("meta_dias").select("*, cliente_metas!inner(id, cliente_id, estatus, semana_numero, metas(semanas))")\
    .eq("fecha", manana.isoformat()).eq("estatus", "Pendiente").eq("cliente_metas.estatus", "Activa").execute().data or []
  enviados = 0
  for d in dias:
    cm = d["cliente_metas"]
    cli = supabase.table("clientes").select("sucursal_id").eq("id", cm["cliente_id"]).single().execute().data or {}
    disponibles = clases_del_dia(manana, d["tipo_clase"], cli.get("sucursal_id"), solo_futuras=True, con_lugar=True)
    nombre = NOMBRE_TIPO.get(d["tipo_clase"], d["tipo_clase"])
    if disponibles:
      c = disponibles[0]
      lugar = f"{c['libres']} {'lugar' if c['libres'] == 1 else 'lugares'}"
      cuerpo = (f"Mañana es {DIAS[manana.isoweekday()]} y te toca {nombre} 💪 Quedan {lugar} a las {hora(c['horario'])}"
                f"{' en ' + c['sucursales']['nombre'] if c.get('sucursales') else ''}. Resérvala para seguir con tu meta.")
    else:
      cuerpo = f"Mañana te toca {nombre} 💪 Reserva tu lugar para seguir con tu meta (semana {cm['semana_numero']})."
    await push_cliente(cm["cliente_id"], f"Mañana: {nombre} 🎯", cuerpo, {"tipo": "meta_recordatorio"})
    enviados += 1
  print(f"🎯 Recordatorios de metas enviados: {enviados}")