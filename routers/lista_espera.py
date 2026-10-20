# routers/lista_espera.py  →  prefijo /lista-espera
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Request
from services.supabase import supabase
from services.auth_app import staff_de_sesion
from services import lista_espera as L
from routers.metas import _cliente

router = APIRouter()
MAX_LISTAS = 3
SEL = "id, nombre_clase, horario, capacidad_max, estado, sucursal_id, room_id, sucursales(nombre), staff(nombre, primer_apellido)"


def _clase(clase_id: str) -> dict:
  c = supabase.table("clases").select(SEL).eq("id", clase_id).limit(1).execute().data
  if not c:
    raise HTTPException(status_code=404, detail="Clase no encontrada")
  return c[0]


def _cierre(clase: dict) -> datetime:
  return datetime.fromisoformat(clase["horario"].replace("Z", "+00:00")) - timedelta(hours=12)


def _validar(cliente_id: str, clase: dict, modo: str):
  """Mismas reglas desde la app y desde el CRM."""
  ahora = datetime.now(timezone.utc)
  if clase.get("estado") not in (None, "Activa"):
    raise HTTPException(status_code=400, detail="Esta clase ya no está activa.")
  if modo == "Remota" and ahora >= _cierre(clase):
    raise HTTPException(status_code=400, detail="La lista de espera de esta clase ya cerró (12 horas antes). Si se libera un lugar, podrás reservarlo normal.")
  if L.libres(clase) > 0:
    raise HTTPException(status_code=400, detail="Todavía hay lugares: puedes reservar directamente.")
  ya = supabase.table("reservas").select("id").eq("cliente_id", cliente_id).eq("clase_id", clase["id"])\
    .neq("estatus", "Cancelada").limit(1).execute().data
  if ya:
    raise HTTPException(status_code=400, detail="Ya tienes reservada esta clase.")
  if supabase.table("lista_espera").select("id").eq("cliente_id", cliente_id).eq("clase_id", clase["id"])\
     .eq("estatus", "Esperando").limit(1).execute().data:
    raise HTTPException(status_code=400, detail="Ya estás en la lista de espera de esta clase.")
  if modo == "Remota":
    activas = supabase.table("lista_espera").select("id", count="exact").eq("cliente_id", cliente_id)\
      .eq("estatus", "Esperando").eq("modo", "Remota").execute().count or 0
    if activas >= MAX_LISTAS:
      raise HTTPException(status_code=400, detail=f"Puedes estar en máximo {MAX_LISTAS} listas de espera a la vez.")
  dia = datetime.fromisoformat(clase["horario"].replace("Z", "+00:00")).astimezone(L.CDMX).date().isoformat()
  memb = supabase.table("membresias").select("id, paquetes(clases_incluidas)").eq("cliente_id", cliente_id)\
    .eq("estatus", "Activa").or_(f"activacion_pendiente.eq.true,and(fecha_inicio.lte.{dia},fecha_fin.gte.{dia})")\
    .limit(1).execute().data
  if not memb:
    raise HTTPException(status_code=403, detail="Necesitas un plan activo para ese día para entrar a la lista de espera.")
  incluidas = (memb[0].get("paquetes") or {}).get("clases_incluidas")
  if incluidas:
    usadas = supabase.table("reservas").select("id", count="exact").eq("membresia_id", memb[0]["id"])\
      .neq("estatus", "Cancelada").execute().count or 0
    if usadas >= incluidas:
      raise HTTPException(status_code=403, detail="Ya usaste todas las clases de tu paquete.")


def _vista(e: dict, clase: dict | None = None) -> dict:
  clase = clase or e.get("clases") or {}
  pos, total = L.posicion(e) if e["estatus"] == "Esperando" else (None, None)
  return {
    "id": e["id"], "clase_id": e["clase_id"], "estatus": e["estatus"], "modo": e["modo"], "motivo": e.get("motivo"),
    "posicion": pos, "total": total, "reserva_id": e.get("reserva_id"), "created_at": e["created_at"],
    "cierre": _cierre(clase).isoformat() if clase.get("horario") else None,
    "clase": {"nombre": L.nombre_clase(clase), "horario": clase.get("horario"),
              "sucursal": (clase.get("sucursales") or {}).get("nombre"),
              "coach": (clase.get("staff") or {}).get("nombre")},
  }


# ── App ───────────────────────────────────────────────────────────────────────
@router.get("/mias")
async def mias(request: Request):
  cli = _cliente(request)
  hace_2_dias = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
  filas = supabase.table("lista_espera").select(f"*, clases!inner({SEL})").eq("cliente_id", cli["id"])\
    .or_(f"estatus.eq.Esperando,actualizado_at.gte.{hace_2_dias}")\
    .gte("clases.horario", datetime.now(timezone.utc).isoformat()).order("created_at", desc=True).execute().data or []
  return {"listas": [_vista(f) for f in filas if f["estatus"] in ("Esperando", "SinLugar")]}


@router.post("/unirse")
async def unirse(request: Request):
  cli = _cliente(request)
  b = await request.json()
  clase = _clase(b.get("clase_id"))
  _validar(cli["id"], clase, "Remota")
  e = supabase.table("lista_espera").insert({"clase_id": clase["id"], "cliente_id": cli["id"], "origen": "App"}).execute().data[0]
  supabase.table("lista_espera_eventos").insert({"lista_id": e["id"], "clase_id": clase["id"], "cliente_id": cli["id"], "tipo": "unido"}).execute()
  return _vista(e, clase)


@router.post("/salir")
async def salir(request: Request):
  cli = _cliente(request)
  b = await request.json()
  supabase.table("lista_espera").update({"estatus": "Salio", "motivo": "el_cliente_salio",
                                         "actualizado_at": datetime.now(timezone.utc).isoformat()})\
    .eq("cliente_id", cli["id"]).eq("clase_id", b.get("clase_id")).eq("estatus", "Esperando").execute()
  return {"ok": True}


# ── CRM ───────────────────────────────────────────────────────────────────────
@router.get("/clase/{clase_id}")
async def de_clase(clase_id: str, request: Request):
  staff_de_sesion(request)
  clase = _clase(clase_id)
  filas = supabase.table("lista_espera").select("*, clientes(id, nombre_completo, email, telefono, supabase_user_id)")\
    .eq("clase_id", clase_id).order("created_at").execute().data or []
  out = []
  for f in filas:
    v = _vista(f, clase)
    v["cliente"] = f.get("clientes") or {}
    v["origen"] = f["origen"]
    out.append(v)
  return {"lista": out, "libres": L.libres(clase), "cierre": _cierre(clase).isoformat(),
          "cerrada": datetime.now(timezone.utc) >= _cierre(clase)}


@router.post("/agregar")
async def agregar(request: Request):
  staff = staff_de_sesion(request)
  b = await request.json()
  modo = "Sucursal" if b.get("modo") == "Sucursal" else "Remota"
  clase = _clase(b.get("clase_id"))
  _validar(b.get("cliente_id"), clase, modo)
  e = supabase.table("lista_espera").insert({"clase_id": clase["id"], "cliente_id": b["cliente_id"], "modo": modo,
                                             "origen": "CRM", "creado_por": staff.get("id")}).execute().data[0]
  supabase.table("lista_espera_eventos").insert({"lista_id": e["id"], "clase_id": clase["id"], "cliente_id": b["cliente_id"], "tipo": "unido"}).execute()
  return _vista(e, clase)


@router.post("/{lista_id}/quitar")
async def quitar(lista_id: str, request: Request):
  staff_de_sesion(request)
  supabase.table("lista_espera").update({"estatus": "Salio", "motivo": "quitado_por_staff",
                                         "actualizado_at": datetime.now(timezone.utc).isoformat()})\
    .eq("id", lista_id).eq("estatus", "Esperando").execute()
  return {"ok": True}


@router.post("/{lista_id}/dar-lugar")
async def dar_lugar(lista_id: str, request: Request):
  """Recepción le da el lugar a quien espera en sucursal (o adelanta a alguien de la fila)."""
  staff_de_sesion(request)
  try:
    rid = supabase.rpc("dar_lugar_sucursal", {"p_lista": lista_id}).execute().data
  except Exception as e:
    msg = str(e)
    raise HTTPException(status_code=400, detail="La clase sigue llena: marca primero como No Show o cancela a quien no llegó."
                        if "sigue llena" in msg else "No se pudo dar el lugar. Actualiza la lista e intenta de nuevo.")
  return {"ok": True, "reserva_id": rid}