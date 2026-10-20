# services/lista_espera.py — avisos de la lista de espera y cierre de la asignación automática
# La asignación de lugares la hace la base de datos (asignar_lista_espera); aquí solo se avisa y se sincroniza.
import os
import httpx
from datetime import datetime, timedelta, timezone
from services.supabase import supabase
from services.stripe_activacion import push_cliente, correo_simple

CDMX = timezone(timedelta(hours=-6))
BACKEND = os.getenv("BACKEND_PUBLIC_URL", "https://navy-traning-backend-production.up.railway.app")
HORAS_ANTES = 3        # la asignación automática se detiene 3 horas antes de la clase…
HORA_TEMPRANO = 9      # …salvo clases antes de las 9:00 am:
HORA_NOCHE = 22        # para esas, se detiene a las 10:00 pm de la noche anterior


def cierre(horario_iso: str) -> datetime:
  """Hasta cuándo se asignan lugares automáticamente (igual que cierre_lista_espera en la base)."""
  h = datetime.fromisoformat(horario_iso.replace("Z", "+00:00"))
  local = h.astimezone(CDMX)
  if local.hour < HORA_TEMPRANO:
    noche = (local - timedelta(days=1)).replace(hour=HORA_NOCHE, minute=0, second=0, microsecond=0)
    return noche.astimezone(timezone.utc)
  return h - timedelta(hours=HORAS_ANTES)

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
SEL_CLASE = "id, nombre_clase, horario, capacidad_max, sucursal_id, estado, sucursales(nombre)"


def cuando(iso: str) -> str:
  d = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(CDMX)
  return f"{DIAS[d.weekday()]} {d.day} a las {d.strftime('%H:%M')}"


def nombre_clase(c: dict) -> str:
  return (c.get("nombre_clase") or "tu clase").strip()


def libres(clase: dict) -> int:
  n = supabase.table("reservas").select("id", count="exact").eq("clase_id", clase["id"]).neq("estatus", "Cancelada").execute().count or 0
  return max(0, (clase.get("capacidad_max") or 0) - n)


def recomendaciones(clase: dict, limite: int = 3) -> list[dict]:
  """Clases parecidas (mismo nombre o mismo tipo) en los próximos 7 días, con lugar."""
  desde = clase["horario"]
  hasta = (datetime.fromisoformat(desde.replace("Z", "+00:00")) + timedelta(days=7)).isoformat()
  q = supabase.table("clases").select(SEL_CLASE).gt("horario", desde).lte("horario", hasta)\
    .eq("estado", "Activa").order("horario").limit(60)
  if clase.get("sucursal_id"):
    q = q.eq("sucursal_id", clase["sucursal_id"])
  tipo = nombre_clase(clase).split()[0].upper()
  out = []
  for c in (q.execute().data or []):
    if tipo not in nombre_clase(c).upper():
      continue
    if libres(c) > 0:
      out.append(c)
    if len(out) >= limite:
      break
  return out


async def _post(path: str, body: dict):
  try:
    async with httpx.AsyncClient(timeout=20) as cli:
      await cli.post(f"{BACKEND}{path}", json=body)
  except Exception as e:
    print(f"lista_espera {path}:", e)


async def _correo(cliente_id: str, asunto: str, html: str):
  cli = supabase.table("clientes").select("email, nombre_completo").eq("id", cliente_id).limit(1).execute().data
  if cli and cli[0].get("email"):
    try:
      await correo_simple(cli[0]["email"], (cli[0].get("nombre_completo") or "").split(" ")[0] or "Hola", asunto, html)
    except Exception as e:
      print("lista_espera correo:", e)


def posicion(entrada: dict) -> tuple[int, int]:
  fila = supabase.table("lista_espera").select("id, created_at").eq("clase_id", entrada["clase_id"])\
    .eq("modo", entrada.get("modo", "Remota")).eq("estatus", "Esperando").order("created_at").execute().data or []
  pos = next((i + 1 for i, f in enumerate(fila) if f["id"] == entrada["id"]), 0)
  return pos, len(fila)


# ── Procesar avisos pendientes (cada 30 s) ────────────────────────────────────
async def procesar_eventos():
  eventos = supabase.table("lista_espera_eventos").select("*").eq("procesado", False)\
    .order("created_at").limit(100).execute().data or []
  for ev in eventos:
    supabase.table("lista_espera_eventos").update({"procesado": True}).eq("id", ev["id"]).execute()
    try:
      await _procesar(ev)
    except Exception as e:
      print(f"lista_espera evento {ev['id']} ({ev['tipo']}):", e)


async def _procesar(ev: dict):
  clase = supabase.table("clases").select(SEL_CLASE).eq("id", ev["clase_id"]).limit(1).execute().data
  if not clase:
    return
  clase = clase[0]
  nombre, hora = nombre_clase(clase), cuando(clase["horario"])
  suc = (clase.get("sucursales") or {}).get("nombre")
  cid, tipo, datos = ev.get("cliente_id"), ev["tipo"], ev.get("datos") or {}

  if tipo == "unido":
    entrada = supabase.table("lista_espera").select("*").eq("id", ev["lista_id"]).limit(1).execute().data
    if not entrada or entrada[0]["estatus"] != "Esperando":
      return
    pos, total = posicion(entrada[0])
    if entrada[0]["modo"] == "Sucursal":
      texto = f"Tu turno es el #{pos} para {nombre} del {hora}. Recepción te avisa si se libera un lugar."
    else:
      texto = f"Eres el #{pos} de {total} para {nombre} del {hora}. Si alguien cancela, te reservamos el lugar automáticamente."
    await push_cliente(cid, "Estás en la lista de espera", texto, {"tipo": "lista_espera", "clase_id": clase["id"]})
    if entrada[0]["origen"] == "CRM":
      await _correo(cid, f"Estás en la lista de espera: {nombre}", f"""
        Te registramos en la lista de espera de <b>{nombre}</b> del <b>{hora}</b>{f' en {suc}' if suc else ''}.<br><br>
        Tu lugar en la fila: <b>#{pos}</b>.<br><br>
        {'Si se libera un lugar, te lo reservamos automáticamente y te llega la confirmación con tu QR. Ten en cuenta que esa reserva ya no se podrá cancelar.'
         if entrada[0]['modo'] == 'Remota' else 'Si se libera un lugar, recepción te lo asigna en ese momento.'}""")

  elif tipo == "asignado":
    rid = datos.get("reserva_id")
    r = supabase.table("reservas").select("id, estatus, spot_id, room_spots(numero)").eq("id", rid).limit(1).execute().data
    if not r or r[0]["estatus"] == "Cancelada" or clase.get("estado") not in (None, "Activa"):
      return
    spot = (r[0].get("room_spots") or {}).get("numero")
    if not datos.get("sucursal"):
      await push_cliente(cid, "¡Se liberó un lugar! 🎉",
        f"Ya tienes tu {nombre} del {hora}{f', spot {spot}' if spot else ''}. Tu QR está en Mis reservas.",
        {"tipo": "lista_espera_asignado", "clase_id": clase["id"], "reserva_id": rid})
    await _post("/reservas/confirmar-notificacion", {"reserva_id": rid, "cliente_id": cid, "clase_id": clase["id"]})
    await _post("/sync/cupos", {"clase_id": clase["id"]})

  elif tipo == "omitido":
    razon = {"sin_plan": "ya no tienes un plan activo para ese día",
             "sin_clases": "ya usaste todas las clases de tu paquete"}.get(datos.get("motivo"), "no se pudo reservar")
    await push_cliente(cid, "No pudimos darte el lugar",
      f"Se liberó un lugar en {nombre} del {hora}, pero {razon}. Renueva tu plan para seguir reservando.",
      {"tipo": "lista_espera"})

  elif tipo == "sin_lugar":
    recs = recomendaciones(clase)
    lista = "".join(f"<li><b>{nombre_clase(c)}</b> · {cuando(c['horario'])}</li>" for c in recs)
    await push_cliente(cid, "No se liberó ningún lugar",
      f"Para {nombre} del {hora} no se liberó lugar." + (f" {nombre_clase(recs[0])} del {cuando(recs[0]['horario'])} tiene lugares." if recs else ""),
      {"tipo": "lista_espera_sin_lugar", "clase_id": clase["id"]})
    await _correo(cid, f"No se liberó lugar en {nombre}", f"""
      Lamentablemente no se liberó ningún lugar para <b>{nombre}</b> del <b>{hora}</b>.<br><br>
      {f'Estas clases parecidas tienen lugar:<ul>{lista}</ul>Resérvalas desde la app de Navy.' if recs else 'Revisa los próximos horarios en la app de Navy.'}<br><br>
      Si de todos modos quieres intentarlo, ve a la sucursal: si alguien no llega, recepción te puede dar su lugar.""")

  elif tipo == "lugar_libre_tarde":
    fila = supabase.table("lista_espera").select("id, cliente_id").eq("clase_id", clase["id"]).eq("modo", "Remota")\
      .in_("estatus", ["Esperando", "SinLugar"]).execute().data or []
    if libres(clase) <= 0:
      return
    for f in fila:
      await push_cliente(f["cliente_id"], "¡Se liberó un lugar!",
        f"Hay un lugar en {nombre} del {hora}. El primero que reserve se lo queda.",
        {"tipo": "lista_espera_libre", "clase_id": clase["id"]})

  elif tipo == "clase_cancelada":
    await push_cliente(cid, "Clase cancelada",
      f"{nombre} del {hora} se canceló, así que cerramos su lista de espera. Revisa otros horarios en la app.",
      {"tipo": "lista_espera"})


# ── Cierre de la asignación automática (cada 5 min) ───────────────────────────
async def cerrar_listas():
  ahora = datetime.now(timezone.utc)
  ventana = (ahora + timedelta(hours=12)).isoformat()      # el corte más lejano posible es ~11 h antes
  fila = supabase.table("lista_espera").select("id, clase_id, cliente_id, clases!inner(horario)")\
    .eq("estatus", "Esperando").eq("modo", "Remota").lte("clases.horario", ventana).execute().data or []
  fila = [f for f in fila if cierre(f["clases"]["horario"]) <= ahora]
  for f in fila:
    supabase.table("lista_espera").update({"estatus": "SinLugar", "actualizado_at": datetime.now(timezone.utc).isoformat()})\
      .eq("id", f["id"]).eq("estatus", "Esperando").execute()
    supabase.table("lista_espera_eventos").insert({
      "lista_id": f["id"], "clase_id": f["clase_id"], "cliente_id": f["cliente_id"], "tipo": "sin_lugar"}).execute()
  if fila:
    print(f"⏳ Listas de espera cerradas: {len(fila)}")