# routers/membresias.py  →  prefijo /membresias
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Request
from services.supabase  import supabase
from services.auth_app  import staff_de_sesion
from services.stripe_activacion import hoy_cdmx
from services.membresias_pendientes import DIAS_MAX_ACTIVACION

router = APIRouter()


@router.post("/fechas")
async def editar_fechas(request: Request):
  """Dirección cambia las fechas de una membresía o la pone en espera de la primera reserva."""
  staff = staff_de_sesion(request, roles=["direccion"])
  b = await request.json()
  r = supabase.table("membresias")\
    .select("id, cliente_id, fecha_inicio, fecha_fin, activacion_pendiente, stripe_subscription_id, "
            "paquetes(nombre, vigencia_dias), clientes(nombre_completo, sucursal_id)")\
    .eq("id", b.get("membresia_id")).limit(1).execute()
  if not r.data:
    raise HTTPException(status_code=404, detail="Membresía no encontrada")
  m   = r.data[0]
  vig = (m.get("paquetes") or {}).get("vigencia_dias") or 30
  hoy = hoy_cdmx()

  if b.get("activacion_pendiente") is True:
    nuevo_inicio, nuevo_fin, pendiente = hoy, hoy + timedelta(days=vig + DIAS_MAX_ACTIVACION), True
  else:
    try:
      nuevo_inicio = date.fromisoformat(b.get("fecha_inicio") or m["fecha_inicio"])
      nuevo_fin    = date.fromisoformat(b.get("fecha_fin") or m["fecha_fin"])
    except ValueError:
      raise HTTPException(status_code=400, detail="Fecha inválida")
    if nuevo_fin <= nuevo_inicio:
      raise HTTPException(status_code=400, detail="La fecha de fin debe ser posterior a la de inicio")
    pendiente = False

  fin_anterior = date.fromisoformat(m["fecha_fin"])
  delta = (nuevo_fin - fin_anterior).days

  upd = {"fecha_inicio": nuevo_inicio.isoformat(), "fecha_fin": nuevo_fin.isoformat(), "activacion_pendiente": pendiente}
  if not pendiente and m.get("activacion_pendiente"):
    upd["activada_at"] = datetime.now(timezone.utc).isoformat()
  if m.get("stripe_subscription_id") and delta != 0:
    upd["stripe_sincronizada"] = False   # el cron mueve el siguiente cobro de Stripe
  supabase.table("membresias").update(upd).eq("id", m["id"]).execute()

  # Paquetes en cola: se recorren lo mismo
  if delta != 0:
    cola = supabase.table("membresias").select("id, fecha_inicio, fecha_fin")\
      .eq("cliente_id", m["cliente_id"]).eq("estatus", "Activa").neq("id", m["id"])\
      .gte("fecha_inicio", m["fecha_fin"]).execute()
    for q in (cola.data or []):
      supabase.table("membresias").update({
        "fecha_inicio": (date.fromisoformat(q["fecha_inicio"]) + timedelta(days=delta)).isoformat(),
        "fecha_fin":    (date.fromisoformat(q["fecha_fin"]) + timedelta(days=delta)).isoformat(),
      }).eq("id", q["id"]).execute()

  activas = supabase.table("membresias").select("fecha_fin")\
    .eq("cliente_id", m["cliente_id"]).eq("estatus", "Activa").execute().data or []
  if activas:
    supabase.table("clientes").update({"fecha_venc_plan": max(a["fecha_fin"] for a in activas)})\
      .eq("id", m["cliente_id"]).execute()

  quien   = " ".join(f"{staff.get('nombre') or ''} {staff.get('primer_apellido') or ''}".split())
  cliente = (m.get("clientes") or {}).get("nombre_completo", "")
  plan    = (m.get("paquetes") or {}).get("nombre", "")
  supabase.table("actividad_log").insert({
    "tipo":        "membresia_fechas",
    "descripcion": f"{quien} cambió las fechas de {plan} de {cliente}: "
                   + ("en espera de su primera reserva" if pendiente else f"{nuevo_inicio:%d/%m/%Y} → {nuevo_fin:%d/%m/%Y}"),
    "tabla":       "membresias",
    "accion":      "UPDATE",
    "metadata":    {"membresia_id": m["id"],
                    "antes":   {"inicio": m["fecha_inicio"], "fin": m["fecha_fin"], "pendiente": m.get("activacion_pendiente")},
                    "despues": {"inicio": nuevo_inicio.isoformat(), "fin": nuevo_fin.isoformat(), "pendiente": pendiente}},
    "sucursal_id": (m.get("clientes") or {}).get("sucursal_id"),
    "staff_id":    staff.get("id"),
  }).execute()

  return {"ok": True, "fecha_inicio": nuevo_inicio.isoformat(), "fecha_fin": nuevo_fin.isoformat(), "pendiente": pendiente}