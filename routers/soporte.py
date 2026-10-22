# routers/soporte.py  →  prefijo /soporte
# Diagnóstico y acciones de soporte de un cliente para el CRM (pestaña "Acceso y soporte").
import re
from datetime import datetime, timezone
import stripe
from fastapi import APIRouter, HTTPException, Request
from services.supabase           import supabase
from services                    import stripe_service  # noqa: F401  (configura Stripe)
from services.auth_app           import staff_de_sesion
from services.stripe_activacion  import push_cliente, hoy_cdmx

router = APIRouter()
EMAIL_OK = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")


def _uno(rpc: str, params: dict):
  try:
    r = supabase.rpc(rpc, params).execute()
    return r.data[0] if r.data else None
  except Exception as e:
    print(f"soporte {rpc}:", e)
    return None


def _cliente(cliente_id: str) -> dict:
  r = supabase.table("clientes").select("*").eq("id", cliente_id).limit(1).execute()
  if not r.data:
    raise HTTPException(status_code=404, detail="Cliente no encontrado")
  return r.data[0]


def _log(staff: dict, cliente: dict, tipo: str, descripcion: str, metadata: dict | None = None):
  quien = " ".join(f"{staff.get('nombre') or ''} {staff.get('primer_apellido') or ''}".split()) or "Sistema"
  try:
    supabase.table("actividad_log").insert({
      "tipo": tipo, "tabla": "clientes", "accion": "UPDATE",
      "descripcion": f"{quien} {descripcion} de \"{cliente.get('nombre_completo') or cliente.get('email')}\"",
      "metadata": {"cliente_id": cliente["id"], **(metadata or {})},
      "sucursal_id": cliente.get("sucursal_id"), "staff_id": staff.get("id"),
    }).execute()
  except Exception as e:
    print("log soporte:", e)


def _seguro(fn, defecto):
  try:
    return fn()
  except Exception as e:
    print("soporte:", e)
    return defecto


@router.get("/cliente/{cliente_id}")
async def diagnostico(cliente_id: str, request: Request):
  staff_de_sesion(request)
  c = _cliente(cliente_id)
  email = (c.get("email") or "").strip()
  hoy = hoy_cdmx().isoformat()
  ahora = datetime.now(timezone.utc).isoformat()

  # ── Cuenta de acceso (Supabase Auth) ──
  auth_id    = _uno("soporte_auth_por_id", {"p_id": c["supabase_user_id"]}) if c.get("supabase_user_id") else None
  auth_email = _uno("soporte_auth_por_email", {"p_email": email}) if email else None
  if auth_id:
    estado_acceso = "ok" if (auth_id.get("email") or "").lower() == email.lower() else "correo_distinto"
  elif auth_email:
    estado_acceso = "sin_vincular"     # existe una cuenta con su correo, pero no está ligada
  elif c.get("supabase_user_id"):
    estado_acceso = "vinculo_roto"     # tiene un ID que ya no existe
  else:
    estado_acceso = "sin_cuenta"
  cuenta = auth_id or auth_email

  # ── Membresía ──
  membs = _seguro(lambda: supabase.table("membresias")
    .select("id, fecha_inicio, fecha_fin, activacion_pendiente, stripe_subscription_id, paquetes(nombre)")
    .eq("cliente_id", cliente_id).eq("estatus", "Activa").execute().data or [], [])
  vigente = next((m for m in sorted(membs, key=lambda m: m["fecha_fin"])
                  if m["fecha_inicio"] <= hoy <= m["fecha_fin"]), None)
  en_espera = next((m for m in membs if m.get("activacion_pendiente")), None)
  ultima = _seguro(lambda: (supabase.table("membresias").select("fecha_fin, paquetes(nombre)")
    .eq("cliente_id", cliente_id).order("fecha_fin", desc=True).limit(1).execute().data or [None])[0], None)

  # ── Penalizaciones sin pagar (bloquean la app) ──
  penal = _seguro(lambda: supabase.table("penalizaciones_noshow").select("*")
    .eq("cliente_id", cliente_id).not_.in_("estatus", ["Pagada", "Condonada"]).execute().data or [], [])

  # ── Notificaciones ──
  tokens = _seguro(lambda: supabase.table("push_tokens").select("*").eq("cliente_id", cliente_id).execute().data or [], [])

  # ── Reservas ──
  reservas = _seguro(lambda: supabase.table("reservas").select("id, estatus, origen, created_at, clases(nombre_clase, horario)")
    .eq("cliente_id", cliente_id).order("created_at", desc=True).limit(200).execute().data or [], [])
  activas = [r for r in reservas if r.get("estatus") != "Cancelada"]
  proximas = [r for r in activas if ((r.get("clases") or {}).get("horario") or "") >= ahora]

  # ── Stripe ──
  stripe_info = None
  if c.get("stripe_customer_id"):
    def _st():
      pms = stripe.PaymentMethod.list(customer=c["stripe_customer_id"], type="card", limit=5).data
      sub = stripe.Subscription.retrieve(c["stripe_subscription_id"]) if c.get("stripe_subscription_id") else None
      return {
        "tarjetas": [{"marca": p.card.brand, "ultimos4": p.card.last4, "vence": f"{p.card.exp_month:02d}/{p.card.exp_year}"} for p in pms],
        "suscripcion": {"estado": sub.status, "cancela_al_final": sub.cancel_at_period_end} if sub else None,
      }
    stripe_info = _seguro(_st, {"error": "No se pudo consultar Stripe"})

  # ── Posibles duplicados ──
  dups = []
  if email:
    dups += _seguro(lambda: supabase.table("clientes").select("id, nombre_completo, email, origen, created_at")
      .ilike("email", email).neq("id", cliente_id).limit(5).execute().data or [], [])
  tel = re.sub(r"\D", "", c.get("telefono") or "")
  if len(tel) >= 10:
    dups += [d for d in _seguro(lambda: supabase.table("clientes").select("id, nombre_completo, email, origen, created_at, telefono")
      .ilike("telefono", f"%{tel[-10:]}").neq("id", cliente_id).limit(5).execute().data or [], [])
      if d["id"] not in {x["id"] for x in dups}]

  # ── Plataformas (Wellhub / TotalPass) ──
  def _plataformas():
    wb = supabase.table("wellhub_bookings").select("booking_number, estatus, created_at, reserva_id")\
      .eq("cliente_id", cliente_id).order("created_at", desc=True).limit(15).execute().data or []
    tb = supabase.table("totalpass_bookings").select("slot_id, estatus, created_at, clase_id, principal")\
      .eq("cliente_id", cliente_id).order("created_at", desc=True).limit(30).execute().data or []
    tb = [b for b in tb if b.get("principal") is not False][:15]
    wc = supabase.table("wellhub_checkins").select("created_at, validado")\
      .eq("cliente_id", cliente_id).order("created_at", desc=True).limit(15).execute().data or []
    tc = supabase.table("totalpass_checkins").select("created_at, estatus, respuesta, place_nombre")\
      .eq("cliente_id", cliente_id).order("created_at", desc=True).limit(15).execute().data or []
    # Nombre y hora de la clase
    ids_res = [b["reserva_id"] for b in wb if b.get("reserva_id")]
    res_map = {r["id"]: r for r in (supabase.table("reservas").select("id, clases(nombre_clase, horario)")
               .in_("id", ids_res).execute().data or [])} if ids_res else {}
    ids_cl = list({b["clase_id"] for b in tb if b.get("clase_id")})
    cl_map = {x["id"]: x for x in (supabase.table("clases").select("id, nombre_clase, horario")
              .in_("id", ids_cl).execute().data or [])} if ids_cl else {}
    for b in wb:
      b["clase"] = (res_map.get(b.get("reserva_id")) or {}).get("clases")
    for b in tb:
      b["clase"] = cl_map.get(b.get("clase_id"))
    return {"wellhub_reservas": wb, "totalpass_reservas": tb, "wellhub_checkins": wc, "totalpass_checkins": tc}
  plataformas = _seguro(_plataformas, {})

  alertas = _seguro(lambda: supabase.table("alertas").select("titulo, descripcion, created_at")
    .eq("cliente_id", cliente_id).order("created_at", desc=True).limit(8).execute().data or [], [])

  return {
    "acceso": {
      "estado": estado_acceso,
      "cuenta": cuenta,
      "supabase_user_id": c.get("supabase_user_id"),
      "correo_valido": bool(EMAIL_OK.match(email)),
      "correo_normalizado": email == email.lower().strip(),
    },
    "membresia": {
      "vigente": vigente, "en_espera": en_espera,
      "ultima_vencida": ultima if not vigente and not en_espera else None,
    },
    "penalizaciones": penal,
    "notificaciones": {"dispositivos": len(tokens),
                       "ultimo": max((t.get("updated_at") or t.get("created_at") or "" for t in tokens), default=None)},
    "reservas": {"total": len(activas), "proximas": len(proximas),
                 "ultima": activas[0] if activas else None,
                 "canceladas": len(reservas) - len(activas)},
    "stripe": stripe_info,
    "duplicados": dups,
    "plataformas": plataformas,
    "alertas": alertas,
  }


@router.post("/cliente/{cliente_id}/crear-acceso")
async def crear_acceso(cliente_id: str, request: Request):
  """Crea la cuenta para entrar a la app, o liga la que ya existe con su correo."""
  staff = staff_de_sesion(request)
  c = _cliente(cliente_id)
  email = (c.get("email") or "").strip().lower()
  if not EMAIL_OK.match(email):
    raise HTTPException(status_code=400, detail="El correo del cliente no es válido. Corrígelo en Datos y guarda primero.")

  existente = _uno("soporte_auth_por_email", {"p_email": email})
  if existente:
    uid, accion = existente["id"], "vinculó la cuenta de acceso existente"
  else:
    try:
      nuevo = supabase.auth.admin.create_user({"email": email, "email_confirm": True,
                                               "user_metadata": {"cliente_id": cliente_id, "nombre": c.get("nombre_completo")}})
      uid, accion = nuevo.user.id, "creó la cuenta de acceso"
    except Exception as e:
      raise HTTPException(status_code=400, detail=f"No se pudo crear la cuenta: {e}")

  supabase.table("clientes").update({"supabase_user_id": str(uid), "email": email}).eq("id", cliente_id).execute()
  _log(staff, c, "acceso_creado", accion, {"supabase_user_id": str(uid)})
  return {"ok": True, "supabase_user_id": str(uid), "vinculada": bool(existente)}


@router.post("/cliente/{cliente_id}/sincronizar-correo")
async def sincronizar_correo(cliente_id: str, request: Request):
  """Hace que el correo de acceso sea el mismo que el del CRM."""
  staff = staff_de_sesion(request)
  c = _cliente(cliente_id)
  email = (c.get("email") or "").strip().lower()
  if not c.get("supabase_user_id"):
    raise HTTPException(status_code=400, detail="El cliente no tiene cuenta de acceso. Usa 'Crear acceso'.")
  if not EMAIL_OK.match(email):
    raise HTTPException(status_code=400, detail="El correo del cliente no es válido.")
  otro = _uno("soporte_auth_por_email", {"p_email": email})
  if otro and str(otro["id"]) != str(c["supabase_user_id"]):
    raise HTTPException(status_code=409, detail=(
      "Ya existe otra cuenta de acceso con ese correo. Puede ser un cliente duplicado: "
      "revisa la sección de posibles duplicados antes de continuar."))
  antes = (_uno("soporte_auth_por_id", {"p_id": c["supabase_user_id"]}) or {}).get("email")
  try:
    supabase.auth.admin.update_user_by_id(c["supabase_user_id"], {"email": email, "email_confirm": True})
  except Exception as e:
    raise HTTPException(status_code=400, detail=f"No se pudo actualizar el correo de acceso: {e}")
  if c.get("email") != email:
    supabase.table("clientes").update({"email": email}).eq("id", cliente_id).execute()
  _log(staff, c, "acceso_correo", f"cambió el correo de acceso ({antes} → {email})", {"antes": antes, "despues": email})
  return {"ok": True, "antes": antes, "despues": email}


@router.post("/cliente/{cliente_id}/push-prueba")
async def push_prueba(cliente_id: str, request: Request):
  staff = staff_de_sesion(request)
  c = _cliente(cliente_id)
  tokens = supabase.table("push_tokens").select("token").eq("cliente_id", cliente_id).execute().data or []
  if not tokens:
    raise HTTPException(status_code=400, detail="El cliente no tiene ningún dispositivo con notificaciones activadas.")
  await push_cliente(cliente_id, "Prueba de Navy ✅", "Si ves esto, tus notificaciones funcionan correctamente.", {"tipo": "prueba"})
  _log(staff, c, "push_prueba", "envió una notificación de prueba")
  return {"ok": True, "dispositivos": len(tokens)}


@router.post("/cliente/{cliente_id}/condonar/{penalizacion_id}")
async def condonar(cliente_id: str, penalizacion_id: str, request: Request):
  """Perdona una penalización por No Show (desbloquea la app). Solo dirección."""
  staff = staff_de_sesion(request, roles=["direccion"])
  c = _cliente(cliente_id)
  r = supabase.table("penalizaciones_noshow").select("*").eq("id", penalizacion_id)\
    .eq("cliente_id", cliente_id).limit(1).execute()
  if not r.data:
    raise HTTPException(status_code=404, detail="Penalización no encontrada")
  supabase.table("penalizaciones_noshow").update({"estatus": "Condonada"}).eq("id", penalizacion_id).execute()
  _log(staff, c, "penalizacion_condonada", f"condonó una penalización de ${r.data[0].get('monto') or ''}",
       {"penalizacion_id": penalizacion_id})
  return {"ok": True}