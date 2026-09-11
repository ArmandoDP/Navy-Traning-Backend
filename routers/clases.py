from fastapi import APIRouter, HTTPException
import httpx
import os
from services.push import enviar_push

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
RESEND_KEY   = os.getenv("RESEND_API_KEY")
MESES        = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']


def fmt_fecha(iso: str) -> str:
    from datetime import datetime
    dt = datetime.fromisoformat(iso.replace('Z', '+00:00'))
    return f"{dt.day} de {MESES[dt.month - 1]} de {dt.year}"


def fmt_hora(iso: str) -> str:
    from datetime import datetime, timedelta
    dt = datetime.fromisoformat(iso.replace('Z', '+00:00'))
    dt_cdmx = dt - timedelta(hours=6)
    return dt_cdmx.strftime("%I:%M %p").lstrip('0')


async def enviar_correo_cancelacion(email: str, nombre: str, clase: dict, sucursal: str):
    nombre1   = nombre.split()[0] if nombre else 'cliente'
    fecha_str = fmt_fecha(clase['horario'])
    hora_str  = fmt_hora(clase['horario'])
    clase_nom = clase['nombre_clase']
    duracion  = clase.get('duracion_minutos', 60)

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Clase cancelada - NAVY</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f172a;">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">
  <tr><td style="background:linear-gradient(145deg,#0f172a,#171B24,#1e2d40,#0f172a);border-radius:28px 28px 0 0;padding:52px 52px 44px;text-align:center;">
    <img src="https://crm.navytrainingcenter.com/email/logo-navy.png" alt="NAVY" width="140" style="display:block;width:140px;height:auto;border:0;margin:0 auto 24px;filter:brightness(0) invert(1);">
    <div style="width:56px;height:56px;background:rgba(239,68,68,0.15);border:2px solid rgba(239,68,68,0.3);border-radius:50%;margin:0 auto 20px;line-height:56px;font-size:24px;text-align:center;">X</div>
    <p style="color:#f1f5f9;font-size:26px;font-weight:900;margin:0 0 8px;">Clase cancelada</p>
    <p style="color:#475569;font-size:14px;margin:0;">Hola {nombre1}, te informamos que una de tus clases ha sido cancelada</p>
  </td></tr>
  <tr><td style="background:#171B24;padding:44px 52px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:20px;overflow:hidden;">
      <tr><td style="background:rgba(239,68,68,0.12);padding:20px 28px;border-bottom:1px solid rgba(239,68,68,0.2);">
        <p style="color:#fca5a5;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;margin:0 0 4px;">Clase cancelada</p>
        <p style="color:#f1f5f9;font-size:22px;font-weight:900;margin:0;">{clase_nom}</p>
      </td></tr>
      <tr><td style="padding:20px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:10px 0;border-bottom:1px solid #1e3a5f;">
            <table width="100%"><tr>
              <td style="color:#475569;font-size:13px;">Fecha</td>
              <td align="right" style="color:#cbd5e1;font-size:13px;font-weight:700;">{fecha_str}</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1e3a5f;">
            <table width="100%"><tr>
              <td style="color:#475569;font-size:13px;">Hora</td>
              <td align="right" style="color:#cbd5e1;font-size:13px;font-weight:700;">{hora_str}</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1e3a5f;">
            <table width="100%"><tr>
              <td style="color:#475569;font-size:13px;">Duracion</td>
              <td align="right" style="color:#cbd5e1;font-size:13px;font-weight:700;">{duracion} min</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:10px 0;">
            <table width="100%"><tr>
              <td style="color:#475569;font-size:13px;">Sucursal</td>
              <td align="right" style="color:#cbd5e1;font-size:13px;font-weight:700;">{sucursal}</td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
      <tr><td style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:14px;padding:20px 24px;">
        <p style="color:#a5b4fc;font-size:14px;font-weight:700;margin:0 0 8px;">Tu reserva fue cancelada automaticamente</p>
        <p style="color:#64748b;font-size:13px;line-height:20px;margin:0;">Esta clase no contara como no-show. Puedes reservar otra clase desde la app cuando quieras.</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="background:linear-gradient(145deg,#0f172a,#171B24);border-radius:0 0 28px 28px;padding:32px 52px;text-align:center;">
    <p style="color:#1e3a5f;font-size:10px;margin:0;letter-spacing:2px;text-transform:uppercase;">2026 Navy Training Center - navytrainingcenter.com</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""

    async with httpx.AsyncClient(timeout=15.0) as client:
        await client.post(
            'https://api.resend.com/emails',
            headers={'Authorization': f'Bearer {RESEND_KEY}', 'Content-Type': 'application/json'},
            json={
                'from':    'Navy Training Center <noreply@navytrainingcenter.com>',
                'to':      email,
                'subject': f'Clase cancelada - {clase_nom}',
                'html':    html,
            }
        )


@router.post("/cancelar")
async def cancelar_clase(req: dict):
    clase_id = req.get("clase_id")
    if not clase_id:
        raise HTTPException(status_code=400, detail="clase_id requerido")

    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Obtener clase
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/clases",
            headers=headers,
            params={
                "id":     f"eq.{clase_id}",
                "select": "id,nombre_clase,horario,duracion_minutos,sucursal_id,wellhub_slot_id,wellhub_class_id,totalpass_occurrence_uuid,sucursales(nombre,totalpass_place_api_key)",
            }
        )
        clases_data = r.json()
        if not clases_data:
            raise HTTPException(status_code=404, detail="Clase no encontrada")
        clase    = clases_data[0]
        sucursal = (clase.get("sucursales") or {}).get("nombre", "Navy Training Center")

        # 2. Cancelar clase
        await client.patch(
            f"{SUPABASE_URL}/rest/v1/clases",
            headers=headers,
            params={"id": f"eq.{clase_id}"},
            json={"estado": "Cancelada"},
        )

        # Cancelar slot en Wellhub
        wellhub_slot_id  = clase.get("wellhub_slot_id")
        wellhub_class_id = clase.get("wellhub_class_id")
        sucursal_id      = clase.get("sucursal_id")

        WELLHUB_GYM_IDS = {
            "1b2032dc-f5da-40c6-8c4e-e227be14673b": "848637",  # Condesa Gym
            "f8f798a8-d89b-4874-a53a-cdcb6325ad2a": "848638",  # Condesa Studio
        }
        WELLHUB_API_KEY = os.getenv("WELLHUB_API_KEY")

        if wellhub_slot_id and wellhub_class_id and sucursal_id:
            gym_id = WELLHUB_GYM_IDS.get(sucursal_id)
            if gym_id:
                try:
                    wh_url = f"https://api.partners.gympass.com/booking/v1/gyms/{gym_id}/classes/{wellhub_class_id}/slots/{wellhub_slot_id}"
                    await client.delete(wh_url, headers={
                        "Authorization": f"Bearer {WELLHUB_API_KEY}",
                        "Content-Type":  "application/json",
                    })
                except Exception as e:
                    print(f"Error cancelando slot Wellhub: {e}")

        # Cancelar en TotalPass
        occurrence_uuid   = clase.get("totalpass_occurrence_uuid")
        place_api_key_tp  = (clase.get("sucursales") or {}).get("totalpass_place_api_key")

        if occurrence_uuid and place_api_key_tp:
            try:
                # Auth TotalPass
                tp_auth = await client.post(
                    "https://booking-api.totalpass.com/partner/auth",
                    json={
                        "partner_api_key": os.getenv("TOTALPASS_PARTNER_API_KEY"),
                        "place_api_key":   place_api_key_tp,
                    }
                )
                tp_token = tp_auth.json().get("token")
                if tp_token:
                    await client.delete(
                        f"https://booking-api.totalpass.com/partner/events/{occurrence_uuid}",
                        headers={"Authorization": f"Bearer {tp_token}", "accept": "application/json"},
                    )
            except Exception as e:
                print(f"Error cancelando TotalPass: {e}")

        # 3. Obtener reservas activas
        r2 = await client.get(
            f"{SUPABASE_URL}/rest/v1/reservas",
            headers=headers,
            params={
                "clase_id": f"eq.{clase_id}",
                "estatus":  "neq.Cancelada",
                "select":   "id,cliente_id,clientes(nombre_completo,email,push_tokens(token))",
            }
        )
        reservas = r2.json() or []

        # 4. Cancelar reservas
        for rv in reservas:
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/reservas",
                headers=headers,
                params={"id": f"eq.{rv['id']}"},
                json={"estatus": "Cancelada", "metadata": {"motivo": "clase_cancelada"}},
            )

    # 5. Push + correo
    for rv in reservas:
        cliente = rv.get("clientes") or {}
        nombre  = cliente.get("nombre_completo", "")
        email   = cliente.get("email", "")
        tokens  = [pt["token"] for pt in (cliente.get("push_tokens") or [])]
        hora    = fmt_hora(clase["horario"])
        fecha   = fmt_fecha(clase["horario"])

        if tokens:
            await enviar_push(
                tokens,
                titulo=f"Clase cancelada - {clase['nombre_clase']}",
                cuerpo=f"Tu clase del {fecha} a las {hora} en {sucursal} fue cancelada. Puedes reservar otra.",
                data={"tipo": "clase_cancelada", "clase_id": clase_id},
            )
        if email:
            try:
                await enviar_correo_cancelacion(email, nombre, clase, sucursal)
            except Exception as e:
                print(f"Error correo cancelacion {email}:", e)

    return {
        "ok":                True,
        "clase_cancelada":   clase_id,
        "reservas_canceladas": len(reservas),
        "notificados":       len(reservas),
    }