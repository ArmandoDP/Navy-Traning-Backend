import os
import httpx
from datetime import datetime

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
LOGO_URL        = "https://crm.navytrainingcenter.com/email/logo-navy.png"

MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto",
         "septiembre","octubre","noviembre","diciembre"]

def _fecha_legible(dt: datetime) -> str:
  return f"{dt.day} de {MESES[dt.month - 1]} de {dt.year}, {dt.strftime('%I:%M %p')}"

HTML_TEMPLATE = """<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif">
<span style="display:none;font-size:1px;color:#f0f2f5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">Tu comprobante de compra en Navy Training Center.</span>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f2f5;padding:40px 16px">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%">

  <tr><td style="background:#171B24;border-radius:24px 24px 0 0;padding:40px 48px 32px;text-align:center">
    <img src="{{LOGO_URL}}" alt="NAVY" width="130" style="display:block;width:130px;height:auto;margin:0 auto 20px">
    <div style="width:52px;height:52px;background:#22c55e;border-radius:50%;margin:0 auto 16px;line-height:52px;font-size:24px;color:#fff">&#10003;</div>
    <p style="color:#fff;font-size:22px;font-weight:900;margin:0;letter-spacing:-0.4px">Compra confirmada</p>
    <p style="color:#6b7280;font-size:12px;margin:6px 0 0;letter-spacing:2px;text-transform:uppercase">Comprobante de pago</p>
  </td></tr>

  <tr><td style="background:#ffffff;padding:40px 48px">
    <p style="color:#374151;font-size:15px;line-height:24px;margin:0 0 28px">
      Hola <strong>{{NOMBRE1}}</strong>, este es el comprobante de tu compra en Navy Training Center. Guárdalo para cualquier aclaración.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border:2px solid #e5e7eb;border-radius:18px;overflow:hidden;margin-bottom:24px">
      {{ITEMS_HTML}}
      <tr><td style="padding:18px 24px;background:#171B24">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="color:#9ca3af;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">Total</td>
            <td align="right" style="color:#ffffff;font-size:22px;font-weight:900">${{MONTO}} MXN</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #f3f4f6;border-radius:14px;overflow:hidden">
      <tr><td style="padding:12px 20px;background:#fafafa;border-bottom:1px solid #f3f4f6">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="color:#9ca3af;font-size:12px">Fecha</td>
          <td align="right" style="color:#111;font-size:12px;font-weight:700">{{FECHA}}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:12px 20px;background:#fafafa;border-bottom:1px solid #f3f4f6">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="color:#9ca3af;font-size:12px">Método de pago</td>
          <td align="right" style="color:#111;font-size:12px;font-weight:700">{{METODO}}</td>
        </tr></table>
      </td></tr>
      {{SUCURSAL_ROW}}
      <tr><td style="padding:12px 20px;background:#fafafa">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="color:#9ca3af;font-size:12px">Folio</td>
          <td align="right" style="color:#111;font-size:12px;font-weight:700">{{FOLIO}}</td>
        </tr></table>
      </td></tr>
    </table>

    <p style="color:#d1d5db;font-size:12px;line-height:20px;margin:28px 0 0;text-align:center">
      ¿Dudas sobre este cargo? Escríbenos a <a href="mailto:contacto@navytrainingcenter.com" style="color:#111">contacto@navytrainingcenter.com</a>
    </p>
  </td></tr>

  <tr><td style="background:#f9fafb;border-radius:0 0 24px 24px;padding:24px 48px;text-align:center;border:1px solid #e5e7eb;border-top:none">
    <p style="color:#9ca3af;font-size:10px;letter-spacing:2px;text-transform:uppercase;margin:0 0 4px;font-weight:700">Navy Training Center</p>
    <p style="color:#d1d5db;font-size:10px;margin:0">&copy; 2026 &middot; navytrainingcenter.com</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>"""

ITEM_ROW_TEMPLATE = """<tr><td style="padding:14px 24px;border-bottom:1px solid #e5e7eb">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="color:#111;font-size:14px;font-weight:700">{nombre}{cantidad_str}</td>
    <td align="right" style="color:#374151;font-size:14px;font-weight:700">${monto}</td>
  </tr></table>
</td></tr>"""

SUCURSAL_ROW_TEMPLATE = """<tr><td style="padding:12px 20px;background:#fafafa;border-bottom:1px solid #f3f4f6">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="color:#9ca3af;font-size:12px">Sucursal</td>
    <td align="right" style="color:#111;font-size:12px;font-weight:700">{sucursal}</td>
  </tr></table>
</td></tr>"""


async def enviar_comprobante_compra(
  email: str,
  nombre: str,
  monto: float,
  metodo_pago: str,
  folio: str,
  concepto: str = None,
  items: list = None,          # [{ "nombre": str, "cantidad": int, "monto": float }]
  sucursal_nombre: str = None,
) -> bool:
  """Envía el comprobante de compra. Usa `concepto` para un solo renglón
  (membresías/paquetes) o `items` para un desglose (ej. The Galley)."""
  if not email:
    print("enviar_comprobante_compra: sin email, se omite envío")
    return False

  nombre1 = (nombre or "").split(" ")[0] or "cliente"

  if items:
    items_html = "".join(
      ITEM_ROW_TEMPLATE.format(
        nombre=it["nombre"],
        cantidad_str=f" &times;{it['cantidad']}" if it.get("cantidad", 1) != 1 else "",
        monto=f"{it['monto']:,.2f}",
      ) for it in items
    )
  else:
    items_html = ITEM_ROW_TEMPLATE.format(nombre=concepto or "Compra", cantidad_str="", monto=f"{monto:,.2f}")

  sucursal_row = SUCURSAL_ROW_TEMPLATE.format(sucursal=sucursal_nombre) if sucursal_nombre else ""

  html = (HTML_TEMPLATE
    .replace("{{LOGO_URL}}", LOGO_URL)
    .replace("{{NOMBRE1}}", nombre1)
    .replace("{{ITEMS_HTML}}", items_html)
    .replace("{{MONTO}}", f"{monto:,.2f}")
    .replace("{{FECHA}}", _fecha_legible(datetime.now()))
    .replace("{{METODO}}", metodo_pago or "Tarjeta")
    .replace("{{SUCURSAL_ROW}}", sucursal_row)
    .replace("{{FOLIO}}", str(folio or "—"))
  )

  concepto_subject = concepto or (items[0]["nombre"] if items else "tu compra")

  async with httpx.AsyncClient(timeout=15.0) as client:
    res = await client.post(
      "https://api.resend.com/emails",
      headers={ "Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json" },
      json={
        "from":    "Navy Training Center <noreply@navytrainingcenter.com>",
        "to":      email,
        "subject": f"🧾 Comprobante de compra — {concepto_subject}",
        "html":    html,
      },
    )
    print("Comprobante compra response:", res.status_code, res.text)
    return res.status_code in (200, 201)
