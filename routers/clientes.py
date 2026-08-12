from fastapi   import APIRouter, HTTPException
from pydantic  import BaseModel
from services.supabase import supabase
import httpx, os

router = APIRouter()

class InvitadoRequest(BaseModel):
  titular_id: str
  nombre:     str
  apellido:   str
  email:      str
  telefono:   str = ''

RESEND_API_KEY = os.getenv("RESEND_API_KEY")

@router.post("/crear-invitado")
async def crear_invitado(req: InvitadoRequest):
  import random, string

  # 1. Traer datos del titular y membresía
  titular_res = supabase.table("clientes")\
    .select("nombre_completo, sucursal_id, paquete_id, membresias(fecha_inicio, fecha_fin, paquete_id)")\
    .eq("id", req.titular_id).single().execute()

  if not titular_res.data:
    raise HTTPException(status_code=404, detail="Titular no encontrado")

  titular   = titular_res.data
  membresia = titular.get("membresias", [{}])[0] if titular.get("membresias") else {}

  # 2. Generar password temporal
  chars    = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  password = 'NAVY-' + ''.join(random.choices(chars, k=6))

  # 3. Crear usuario en Supabase Auth via API
  supabase_url = os.getenv("SUPABASE_URL")
  supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
  
  async with httpx.AsyncClient() as client:
    auth_res = await client.post(
      f"{supabase_url}/auth/v1/admin/users",
      headers={ "Authorization": f"Bearer {supabase_key}", "apikey": supabase_key },
      json={ "email": req.email, "password": password, "email_confirm": True }
    )
    user_id = auth_res.json().get("id") if auth_res.status_code == 200 else None

  # 4. Crear cliente invitado
  invitado_res = supabase.table("clientes").insert({
    "nombre_completo":      f"{req.nombre} {req.apellido}".strip(),
    "primer_apellido":      req.apellido,
    "email":                req.email,
    "telefono":             req.telefono,
    "sucursal_id":          titular.get("sucursal_id"),
    "paquete_id":           titular.get("paquete_id"),
    "estatus":              "Activo",
    "origen":               "Invitado",
    "es_invitado":          True,
    "invitado_de":          req.titular_id,
    "supabase_user_id":     user_id,
    "password_temporal":    password,
    "debe_cambiar_password": True,
  }).execute()

  invitado = invitado_res.data[0] if invitado_res.data else None

  # 5. Crear membresía del invitado
  if invitado and membresia:
    supabase.table("membresias").insert({
      "cliente_id":    invitado["id"],
      "paquete_id":    membresia.get("paquete_id"),
      "fecha_inicio":  membresia.get("fecha_inicio"),
      "fecha_fin":     membresia.get("fecha_fin"),
      "estatus":       "Activa",
      "precio_pagado": 0,
      "origen":        "Invitado",
    }).execute()

  # 6. Mandar correo de invitación
  async with httpx.AsyncClient() as client:
    await client.post(
      "https://api.resend.com/emails",
      headers={ "Authorization": f"Bearer {RESEND_API_KEY}" },
      json={
        "from":    "Navy Training Center <noreply@navytrainingcenter.com>",
        "to":      req.email,
        "subject": "¡Fuiste invitado a Navy Training Center! 🏋️",
        "html":    f"""
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
            <div style="background:#171B24;padding:32px;text-align:center;border-radius:16px 16px 0 0">
              <p style="color:#fff;font-size:24px;font-weight:900;margin:0">NAVY</p>
              <p style="color:#9ca3af;font-size:11px;letter-spacing:4px;margin:4px 0 0">TRAINING CENTER</p>
            </div>
            <div style="background:#fff;padding:32px;border-radius:0 0 16px 16px;border:1px solid #f3f4f6">
              <h2 style="color:#111">¡Hola {req.nombre}! 👋</h2>
              <p style="color:#6b7280;font-size:15px;line-height:24px">
                <strong>{titular['nombre_completo']}</strong> te ha invitado a Navy Training Center.
                Tendrás acceso a todas las clases y beneficios del paquete sin costo adicional.
              </p>
              <div style="background:#f9fafb;border-radius:12px;padding:20px;margin:24px 0">
                <p style="font-size:13px;font-weight:700;color:#9ca3af;margin:0 0 12px">Tus credenciales</p>
                <p style="font-size:14px;color:#111;margin:0 0 8px"><strong>Usuario:</strong> {req.email}</p>
                <p style="font-size:14px;color:#111;margin:0"><strong>Contraseña temporal:</strong> {password}</p>
              </div>
              <div style="text-align:center;margin-top:24px">
                <a href="https://navytrainingcenter.com" 
                  style="background:#171B24;color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700">
                  Descargar la app →
                </a>
              </div>
            </div>
          </div>
        """
      }
    )

  return { "ok": True }