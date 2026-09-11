from fastapi        import APIRouter, HTTPException
from services.supabase import supabase
from services.push     import enviar_push
import httpx
import os

router = APIRouter()

RESEND_KEY   = os.getenv("RESEND_API_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://crm.navytrainingcenter.com")
MESES        = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']


def fmt_fecha(iso: str) -> str:
    from datetime import datetime
    dt = datetime.fromisoformat(iso.replace('Z', '+00:00'))
    return f"{dt.day} de {MESES[dt.month - 1]} de {dt.year}"

def fmt_hora(iso: str) -> str:
    from datetime import datetime, timezone, timedelta
    dt = datetime.fromisoformat(iso.replace('Z', '+00:00'))
    dt_cdmx = dt - timedelta(hours=6)
    hora = dt_cdmx.strftime("%I:%M %p").lstrip('0')
    return hora


async def enviar_correo_cancelacion(email: str, nombre: str, clase: dict, sucursal: str):
    nombre1    = nombre.split()[0]
    fecha_str  = fmt_fecha(clase['horario'])
    hora_str   = fmt_hora(clase['horario'])
    clase_nom  = clase['nombre_clase']
    duracion   = clase.get('duracion_minutos', 60)

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Clase cancelada — NAVY</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f172a;">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(145deg,#0f172a,#171B24,#1e2d40,#0f172a);border-radius:28px 28px 0 0;padding:52px 52px 44px;text-align:center;">
    <table width="80" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 32px;">
      <tr><td style="height:3px;background:linear-gradient(90deg,transparent,#ef4444,#f87171,#ef4444,transparent);border-radius:2px;"></td></tr>
    </table>
    <img src="https://crm.navytrainingcenter.com/email/logo-navy.png" alt="NAVY" width="140" style="display:block;width:140px;height:auto;border:0;margin:0 auto 24px;filter:brightness(0) invert(1);">
    <div style="width:56px;height:56px;background:rgba(239,68,68,0.15);border:2px solid rgba(239,68,68,0.3);border-radius:50%;margin:0 auto 20px;line-height:52px;font-size:24px;text-align:center;">❌</div>
    <p style="color:#f1f5f9;font-size:26px;font-weight:900;margin:0 0 8px;letter-spacing:-0.4px;">Clase cancelada</p>
    <p style="color:#475569;font-size:14px;margin:0;">Hola {nombre1}, te informamos que una de tus clases ha sido cancelada</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:40px;">
      <tr><td style="height:1px;background:linear-gradient(90deg,transparent,#1e3a5f 30%,#2d4a6f 50%,#1e3a5f 70%,transparent);"></td></tr>
    </table>
  </td></tr>

  <!-- DETALLE CLASE -->
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
              <td style="color:#475569;font-size:13px;">Duración</td>
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

    <!-- Aviso -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
      <tr><td style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:14px;padding:20px 24px;">
        <p style="color:#a5b4fc;font-size:14px;font-weight:700;margin:0 0 8px;">Tu reserva fue cancelada automáticamente</p>
        <p style="color:#64748b;font-size:13px;line-height:20px;margin:0;">Esta clase no contará como no-show. Puedes reservar otra clase desde la app cuando quieras.</p>
      </td></tr>
    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:linear-gradient(145deg,#0f172a,#171B24);border-radius:0 0 28px 28px;padding:32px 52px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
      <tr><td style="text-align:center;">
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
          <tr>
            <td style="padding:0 14px;border-right:1px solid #1e3a5f;"><p style="color:#334155;font-size:9px;margin:0;letter-spacing:2px;text-transform:uppercase;">Condesa</p></td>
            <td style="padding:0 14px;border-right:1px solid #1e3a5f;"><p style="color:#334155;font-size:9px;margin:0;letter-spacing:2px;text-transform:uppercase;">Lomas</p></td>
            <td style="padding:0 14px;border-right:1px solid #1e3a5f;"><p style="color:#334155;font-size:9px;margin:0;letter-spacing:2px;text-transform:uppercase;">Interlomas</p></td>
            <td style="padding:0 14px;"><p style="color:#334155;font-size:9px;margin:0;letter-spacing:2px;text-transform:uppercase;">Juriquilla</p></td>
          </tr>
        </table>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:1px;background:linear-gradient(90deg,transparent,#1e3a5f,transparent);"></td></tr>
    </table>
    <p style="color:#1e3a5f;font-size:10px;margin:16px 0 0;text-align:center;letter-spacing:2px;text-transform:uppercase;">© 2026 Navy Training Center · navytrainingcenter.com</p>
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
                'subject': f'❌ Clase cancelada — {clase_nom}',
                'html':    html,
            }
        )


@router.post("/clases/cancelar")
async def cancelar_clase(req: dict):
    clase_id = req.get("clase_id")
    if not clase_id:
        raise HTTPException(status_code=400, detail="clase_id requerido")

    # 1. Obtener clase con sucursal
    clase_res = supabase.table("clases")\
        .select("id, nombre_clase, horario, duracion_minutos, sucursal_id, sucursales(nombre)")\
        .eq("id", clase_id).single().execute()

    if not clase_res.data:
        raise HTTPException(status_code=404, detail="Clase no encontrada")

    clase      = clase_res.data
    sucursal   = clase.get("sucursales", {}).get("nombre", "Navy Training Center")

    # 2. Cancelar la clase
    supabase.table("clases").update({ "estado": "Cancelada" }).eq("id", clase_id).execute()

    # 3. Obtener reservas activas de esa clase
    reservas_res = supabase.table("reservas")\
        .select("id, cliente_id, clientes(nombre_completo, email, push_tokens(token))")\
        .eq("clase_id", clase_id)\
        .neq("estatus", "Cancelada")\
        .execute()

    reservas = reservas_res.data or []

    # 4. Cancelar todas las reservas con motivo "clase_cancelada"
    if reservas:
        ids = [r["id"] for r in reservas]
        supabase.table("reservas").update({
            "estatus": "Cancelada",
            "metadata": {"motivo": "clase_cancelada"}
        }).in_("id", ids).execute()

    # 5. Push + correo a cada cliente
    for r in reservas:
        cliente = r.get("clientes", {})
        if not cliente:
            continue

        nombre  = cliente.get("nombre_completo", "")
        email   = cliente.get("email", "")
        tokens  = [pt["token"] for pt in (cliente.get("push_tokens") or [])]
        hora    = fmt_hora(clase["horario"])
        fecha   = fmt_fecha(clase["horario"])

        # Push
        if tokens:
            await enviar_push(
                tokens,
                titulo=f"❌ Clase cancelada — {clase['nombre_clase']}",
                cuerpo=f"Tu clase del {fecha} a las {hora} en {sucursal} fue cancelada. Puedes reservar otra clase.",
                data={ "tipo": "clase_cancelada", "clase_id": clase_id }
            )

        # Correo
        if email:
            try:
                await enviar_correo_cancelacion(email, nombre, clase, sucursal)
            except Exception as e:
                print(f"Error enviando correo cancelación a {email}:", e)

    return {
        "ok":              True,
        "clase_cancelada": clase_id,
        "reservas_canceladas": len(reservas),
        "notificados":     len(reservas),
    }