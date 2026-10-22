from fastapi    import APIRouter, HTTPException
from services.push import enviar_push
import httpx, os, qrcode, base64
from io import BytesIO
from datetime import datetime, timedelta

router = APIRouter()

RESEND_KEY = os.getenv("RESEND_API_KEY")
MESES      = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

SB_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
}

def fmt_fecha(iso: str) -> str:
    dt = datetime.fromisoformat(iso.replace('Z', '+00:00'))
    dt_cdmx = dt - timedelta(hours=6)
    return f"{dt_cdmx.day} de {MESES[dt_cdmx.month - 1]} de {dt_cdmx.year}"

def fmt_hora(iso: str) -> str:
    dt = datetime.fromisoformat(iso.replace('Z', '+00:00'))
    dt_cdmx = dt - timedelta(hours=6)
    return dt_cdmx.strftime("%I:%M %p").lstrip('0')

def fmt_dia_semana(iso: str) -> str:
    dt = datetime.fromisoformat(iso.replace('Z', '+00:00'))
    dt_cdmx = dt - timedelta(hours=6)
    dias = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
    return dias[dt_cdmx.weekday()]

def generar_qr_base64(reserva_id: str) -> str:
    qr = qrcode.QRCode(version=1, box_size=8, border=2)
    qr.add_data(reserva_id)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode()

def google_calendar_url(nombre_clase: str, horario: str, sucursal: str, duracion_min: int = 60) -> str:
    dt = datetime.fromisoformat(horario.replace('Z', '+00:00'))
    dt_fin = dt + timedelta(minutes=duracion_min)
    fmt = "%Y%m%dT%H%M%SZ"
    titulo = f"Clase Navy: {nombre_clase}"
    location = f"Navy Training Center - {sucursal}"
    return (
        f"https://calendar.google.com/calendar/render?action=TEMPLATE"
        f"&text={titulo.replace(' ', '+')}"
        f"&dates={dt.strftime(fmt)}/{dt_fin.strftime(fmt)}"
        f"&location={location.replace(' ', '+')}"
        f"&details=Reserva+en+Navy+Training+Center"
    )

async def enviar_correo_reserva(
    email: str, nombre: str, reserva_id: str,
    clase: dict, sucursal: str, spot_numero: str | None
):
    nombre1    = nombre.split()[0] if nombre else 'cliente'
    fecha_str  = fmt_fecha(clase['horario'])
    dia_str    = fmt_dia_semana(clase['horario'])
    hora_str   = fmt_hora(clase['horario'])
    clase_nom  = clase['nombre_clase']
    duracion   = clase.get('duracion_minutos', 60)
    qr_b64     = generar_qr_base64(reserva_id)
    cal_url    = google_calendar_url(clase_nom, clase['horario'], sucursal, duracion)

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reserva confirmada — NAVY</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f172a;">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(145deg,#0f172a,#171B24,#1e2d40,#0f172a);border-radius:28px 28px 0 0;padding:52px 52px 44px;text-align:center;">
    <img src="https://crm.navytrainingcenter.com/email/logo-navy.png" alt="NAVY" width="140" style="display:block;width:140px;height:auto;border:0;margin:0 auto 24px;filter:brightness(0) invert(1);">
    <div style="width:56px;height:56px;background:rgba(34,197,94,0.15);border:2px solid rgba(34,197,94,0.3);border-radius:50%;margin:0 auto 20px;line-height:56px;font-size:24px;text-align:center;">✓</div>
    <p style="color:#f1f5f9;font-size:26px;font-weight:900;margin:0 0 8px;">¡Reserva confirmada!</p>
    <p style="color:#475569;font-size:14px;margin:0;">Hola {nombre1}, tu lugar está apartado. Te esperamos.</p>
  </td></tr>

  <!-- DETALLE CLASE -->
  <tr><td style="background:#171B24;padding:44px 52px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:20px;overflow:hidden;">
      <tr><td style="background:rgba(34,197,94,0.12);padding:20px 28px;border-bottom:1px solid rgba(34,197,94,0.2);">
        <p style="color:#86efac;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;margin:0 0 4px;">Clase reservada</p>
        <p style="color:#f1f5f9;font-size:22px;font-weight:900;margin:0;">{clase_nom}</p>
      </td></tr>
      <tr><td style="padding:20px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:10px 0;border-bottom:1px solid #1e3a5f;">
            <table width="100%"><tr>
              <td style="color:#475569;font-size:13px;">Día</td>
              <td align="right" style="color:#cbd5e1;font-size:13px;font-weight:700;">{dia_str}</td>
            </tr></table>
          </td></tr>
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
          <tr><td style="padding:10px 0;border-bottom:1px solid #1e3a5f;">
            <table width="100%"><tr>
              <td style="color:#475569;font-size:13px;">Sucursal</td>
              <td align="right" style="color:#cbd5e1;font-size:13px;font-weight:700;">{sucursal}</td>
            </tr></table>
          </td></tr>
          {"" if not spot_numero else f'''
          <tr><td style="padding:10px 0;">
            <table width="100%"><tr>
              <td style="color:#475569;font-size:13px;">Spot</td>
              <td align="right" style="color:#cbd5e1;font-size:13px;font-weight:700;">{spot_numero}</td>
            </tr></table>
          </td></tr>'''}
        </table>
      </td></tr>
    </table>

    <!-- QR -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;">
      <tr><td align="center">
        <p style="color:#94a3b8;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px;">Tu código QR de entrada</p>
        <div style="background:#ffffff;border-radius:20px;padding:20px;display:inline-block;">
          <img src="data:image/png;base64,{qr_b64}" alt="QR Code" width="180" style="display:block;width:180px;height:180px;border:0;">
        </div>
        <p style="color:#475569;font-size:12px;margin:16px 0 0;">Muestra este código en recepción al llegar</p>
      </td></tr>
    </table>

    <!-- Google Calendar -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
      <tr><td align="center">
        <a href="{cal_url}" style="display:inline-block;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:14px;padding:14px 28px;text-decoration:none;color:#a5b4fc;font-size:13px;font-weight:700;">
          📅 Agregar a Google Calendar
        </a>
      </td></tr>
    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:linear-gradient(145deg,#0f172a,#171B24);border-radius:0 0 28px 28px;padding:32px 52px;text-align:center;">
    <p style="color:#1e3a5f;font-size:10px;margin:0;letter-spacing:2px;text-transform:uppercase;">© 2026 Navy Training Center · navytrainingcenter.com</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>"""

    async with httpx.AsyncClient(timeout=20.0) as client:
        await client.post(
            'https://api.resend.com/emails',
            headers={'Authorization': f'Bearer {RESEND_KEY}', 'Content-Type': 'application/json'},
            json={
                'from':    'Navy Training Center <noreply@navytrainingcenter.com>',
                'to':      email,
                'subject': f'✅ Reserva confirmada — {clase_nom}',
                'html':    html,
            }
        )


@router.post("/reservas/confirmar-notificacion")
async def confirmar_notificacion_reserva(req: dict):
    reserva_id  = req.get("reserva_id")
    cliente_id  = req.get("cliente_id")
    clase_id    = req.get("clase_id")

    if not all([reserva_id, cliente_id, clase_id]):
        raise HTTPException(status_code=400, detail="Faltan parámetros")

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Obtener clase
        r_clase = await client.get(
            f"{SUPABASE_URL}/rest/v1/clases",
            headers=SB_HEADERS,
            params={"id": f"eq.{clase_id}", "select": "id,nombre_clase,horario,duracion_minutos,sucursales(nombre)"}
        )
        clases = r_clase.json()
        if not clases:
            raise HTTPException(status_code=404, detail="Clase no encontrada")
        clase    = clases[0]
        sucursal = (clase.get("sucursales") or {}).get("nombre", "Navy Training Center")

        # Obtener cliente
        r_cli = await client.get(
            f"{SUPABASE_URL}/rest/v1/clientes",
            headers=SB_HEADERS,
            params={"id": f"eq.{cliente_id}", "select": "id,nombre_completo,email"}
        )
        clientes = r_cli.json()
        if not clientes:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        cliente = clientes[0]

        # Obtener spot
        r_reserva = await client.get(
            f"{SUPABASE_URL}/rest/v1/reservas",
            headers=SB_HEADERS,
            params={"id": f"eq.{reserva_id}", "select": "id,spot_id,room_spots(numero)"}
        )
        reservas  = r_reserva.json()
        spot_num  = None
        if reservas and reservas[0].get("room_spots"):
            spot_num = str(reservas[0]["room_spots"]["numero"])

        # Obtener push tokens
        r_tokens = await client.get(
            f"{SUPABASE_URL}/rest/v1/push_tokens",
            headers=SB_HEADERS,
            params={"cliente_id": f"eq.{cliente_id}", "select": "token"}
        )
        tokens = [t["token"] for t in (r_tokens.json() or [])]

    hora_str  = fmt_hora(clase['horario'])
    fecha_str = fmt_fecha(clase['horario'])

    # Push notification
    if tokens:
        await enviar_push(
            tokens,
            titulo=f"✅ Reserva confirmada — {clase['nombre_clase']}",
            cuerpo=f"Tu clase del {fecha_str} a las {hora_str} en {sucursal} está confirmada.",
            data={"tipo": "reserva_confirmada", "reserva_id": reserva_id, "clase_id": clase_id}
        )

    # Correo con QR
    if cliente.get("email"):
        try:
            await enviar_correo_reserva(
                email=cliente["email"],
                nombre=cliente["nombre_completo"],
                reserva_id=reserva_id,
                clase=clase,
                sucursal=sucursal,
                spot_numero=spot_num,
            )
        except Exception as e:
            print(f"Error correo reserva: {e}")

    return {"ok": True, "push_enviadas": len(tokens), "correo": bool(cliente.get("email"))}