# routers/auth_publico.py — antes de pedir el código en la app: ¿en qué caso está este correo?
# Responde solo el CASO (no datos del cliente):
#   cuenta      → tiene cuenta Navy: se le manda el código (si tenía ficha sin usuario, aquí se le crea)
#   plataforma  → solo es usuario de Wellhub/TotalPass (sin plan Navy)
#   sin_cuenta  → no existe en Navy
#   + "sugerencia" si parece un error de dedo en el dominio (gmaill.com, hotmial.com…)
import re
from fastapi import APIRouter, HTTPException
from services.supabase import supabase

router = APIRouter()

DOMINIOS = {
  "gmaill.com": "gmail.com", "gmial.com": "gmail.com", "gmal.com": "gmail.com", "gmai.com": "gmail.com",
  "gnail.com": "gmail.com", "gamil.com": "gmail.com", "gmail.co": "gmail.com", "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com", "gmail.om": "gmail.com", "gmailcom": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmil.com": "hotmail.com",
  "hotmail.con": "hotmail.com", "hotmail.co": "hotmail.com", "hotmail.cm": "hotmail.com",
  "outlok.com": "outlook.com", "outloo.com": "outlook.com", "outlook.con": "outlook.com",
  "yaho.com": "yahoo.com", "yahoo.con": "yahoo.com", "yahoo.com.m": "yahoo.com.mx",
  "icloud.co": "icloud.com", "icloud.con": "icloud.com", "iclod.com": "icloud.com",
}


def _sugerencia(email: str) -> str | None:
  if "@" not in email: return None
  usuario, dominio = email.rsplit("@", 1)
  return f"{usuario}@{DOMINIOS[dominio]}" if dominio in DOMINIOS else None


@router.post("/revisar-correo")
async def revisar_correo(req: dict):
  email = (req.get("email") or "").strip().lower()
  if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
    raise HTTPException(status_code=400, detail="Escribe un correo válido")

  cli = supabase.table("clientes").select("id, origen").ilike("email", email).limit(1).execute().data
  if not cli:
    return {"estado": "sin_cuenta", "sugerencia": _sugerencia(email)}
  cli = cli[0]

  # ¿Solo es de Wellhub / TotalPass? (nunca ha tenido un plan Navy)
  origen = (cli.get("origen") or "").lower()
  plataforma = "Wellhub" if "wellhub" in origen else "TotalPass" if "totalpass" in origen else None
  if plataforma:
    tuvo_plan = supabase.table("membresias").select("id").eq("cliente_id", cli["id"]).limit(1).execute().data
    if tuvo_plan: plataforma = None

  # Si tiene ficha pero no usuario de acceso (alta en recepción, migraciones…), se le crea ahora
  try:
    tiene = supabase.rpc("existe_usuario_acceso", {"p_email": email}).execute().data
    if not tiene:
      res = supabase.auth.admin.create_user({"email": email, "email_confirm": True,
                                             "user_metadata": {"origen": "alta automática al iniciar sesión"}})
      uid = getattr(getattr(res, "user", None), "id", None)
      if uid:
        supabase.table("clientes").update({"supabase_user_id": uid}).eq("id", cli["id"]).execute()
  except Exception as e:
    if "already" not in str(e).lower():
      print("revisar-correo crear usuario:", e)

  return {"estado": "plataforma", "plataforma": plataforma} if plataforma else {"estado": "cuenta"}