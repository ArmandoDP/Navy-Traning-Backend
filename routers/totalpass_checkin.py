# routers/totalpass_checkin.py  →  prefijo /totalpass-checkin
# TotalPass avisa cuando un usuario hace check-in en su app; nosotros validamos la visita.
import os
import httpx
from fastapi            import APIRouter, Request, HTTPException
from services.supabase  import supabase
from services.auth_app  import staff_de_sesion

router = APIRouter()

# on  → se valida en automático al llegar el aviso (como Wellhub)
# off → queda Pendiente y recepción lo valida desde el CRM
VALIDACION_AUTOMATICA = os.getenv("TOTALPASS_CHECKIN_AUTO", "on") == "on"


async def _validar(checkin: dict) -> dict:
  """Llama a la URL de confirmación que mandó TotalPass."""
  try:
    async with httpx.AsyncClient(timeout=15.0) as client:
      r = await client.post(checkin["endpoint"])
    ok = r.status_code == 200
    texto = r.text[:300]
  except Exception as e:
    ok, texto = False, str(e)

  supabase.table("totalpass_checkins").update({
    "estatus":   "Validado" if ok else "Rechazado",
    "respuesta": texto,
  }).eq("id", checkin["id"]).execute()

  if ok:
    print(f"✅ Check-in TotalPass validado: {checkin.get('email')}")
  else:
    print(f"❌ Check-in TotalPass no validado: {checkin.get('email')} → {texto}")
    supabase.table("alertas").insert({
      "tipo":        "pago_fallido",
      "categoria":   "operacion",
      "titulo":      f"Check-in TotalPass no validado — {checkin.get('nombre') or checkin.get('email') or ''}".strip(),
      "descripcion": texto,
      "cliente_id":  checkin.get("cliente_id"),
      "metadata":    {"checkin_id": checkin["id"]},
    }).execute()
  return {"validado": ok, "respuesta": texto}


@router.post("/webhook")
async def totalpass_checkin_webhook(request: Request):
  body = await request.json()
  print("TotalPass Check-in webhook:", body)

  if body.get("type") != "CHECK_IN_CREATED" or not body.get("endpoint"):
    return {"received": True}

  user  = body.get("user") or {}
  place = body.get("place") or {}
  ci    = body.get("check_in") or {}
  email = (user.get("email") or "").strip().lower() or None

  # Cliente (sin importar mayúsculas); si no existe, se crea
  cliente_id = None
  if email:
    r = supabase.table("clientes").select("id").ilike("email", email).limit(1).execute()
    cliente_id = r.data[0]["id"] if r.data else None
    if not cliente_id:
      try:
        nuevo = supabase.table("clientes").insert({
          "nombre_completo": (user.get("name") or email.split("@")[0]).strip(),
          "email":           email,
          "telefono":        user.get("phone"),
          "estatus":         "Activo",
          "plan":            "TotalPass",
          "origen":          "TotalPass",
        }).execute()
        cliente_id = nuevo.data[0]["id"] if nuevo.data else None
      except Exception as e:
        print("Error creando cliente TotalPass (check-in):", e)

  fila = supabase.table("totalpass_checkins").insert({
    "cliente_id":       cliente_id,
    "email":            email,
    "nombre":           user.get("name"),
    "codigo_usuario":   user.get("code"),
    "place_identifier": place.get("place"),
    "place_nombre":     place.get("name"),
    "endpoint":         body["endpoint"],
    "started_at":       ci.get("started_at"),
    "expires_at":       ci.get("expires_at"),
    "metadata":         body,
  }).execute().data[0]

  if VALIDACION_AUTOMATICA:
    res = await _validar(fila)
    return {"received": True, **res}
  return {"received": True, "pendiente": True}


@router.get("/pendientes")
async def checkins_pendientes(request: Request):
  """Para recepción: check-ins de hoy que faltan por validar."""
  staff_de_sesion(request)
  r = supabase.table("totalpass_checkins")\
    .select("id, cliente_id, email, nombre, place_nombre, started_at, expires_at, estatus, respuesta")\
    .neq("estatus", "Validado").order("created_at", desc=True).limit(50).execute()
  return {"checkins": r.data or []}


@router.post("/validar/{checkin_id}")
async def validar_manual(checkin_id: str, request: Request):
  """Validación desde el CRM (si la automática está apagada o falló)."""
  staff_de_sesion(request)
  r = supabase.table("totalpass_checkins").select("*").eq("id", checkin_id).limit(1).execute()
  if not r.data:
    raise HTTPException(status_code=404, detail="Check-in no encontrado")
  return await _validar(r.data[0])