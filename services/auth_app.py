# services/auth_app.py
# Quién está llamando: cliente de la app, staff del CRM o un script interno.
import os
from fastapi           import HTTPException, Request
from services.supabase import supabase


def es_interno(request: Request) -> bool:
  k = request.headers.get("x-internal-key")
  return bool(k) and k == os.getenv("SUPABASE_SERVICE_ROLE_KEY")


def email_de_sesion(request: Request) -> str:
  auth = request.headers.get("authorization", "")
  if not auth.lower().startswith("bearer "):
    raise HTTPException(status_code=401, detail="Sesión requerida")
  try:
    return (supabase.auth.get_user(auth[7:]).user.email or "").lower()
  except Exception:
    raise HTTPException(status_code=401, detail="Sesión inválida o expirada")


def staff_de_sesion(request: Request, roles: list[str] | None = None) -> dict:
  if es_interno(request):
    return {"id": None, "nombre": "Sistema", "primer_apellido": "", "rol": "direccion"}
  email = email_de_sesion(request)
  st = supabase.table("staff").select("id, nombre, primer_apellido, rol, estatus")\
    .ilike("email", email).limit(1).execute()
  if not st.data or st.data[0].get("estatus") != "Activo":
    raise HTTPException(status_code=403, detail="Solo staff activo")
  if roles and st.data[0].get("rol") not in roles:
    raise HTTPException(status_code=403, detail="No tienes permiso para esta acción")
  return st.data[0]


def autorizar_cliente(request: Request, cliente_id: str) -> None:
  """El propio cliente o cualquier staff activo."""
  if es_interno(request):
    return
  email = email_de_sesion(request)
  cli = supabase.table("clientes").select("email").eq("id", cliente_id).limit(1).execute()
  if cli.data and (cli.data[0].get("email") or "").lower() == email:
    return
  st = supabase.table("staff").select("estatus").ilike("email", email).limit(1).execute()
  if st.data and st.data[0].get("estatus") == "Activo":
    return
  raise HTTPException(status_code=403, detail="No autorizado")