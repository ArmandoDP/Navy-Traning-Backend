# services/comprobante_pdf.py — comprobante de pago en PDF (estilo Navy)
from io import BytesIO
from datetime import datetime, timedelta, timezone
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

CDMX = timezone(timedelta(hours=-6))
NEGRO, GRIS, CLARO, LINEA = HexColor("#171B24"), HexColor("#6b7280"), HexColor("#9ca3af"), HexColor("#e5e7eb")


def dinero(n) -> str:
  return f"${float(n or 0):,.2f} MXN"


def comprobante_pdf(pago: dict, cliente: dict, sucursal: str | None, detalle: dict | None = None) -> bytes:
  buf = BytesIO()
  c = canvas.Canvas(buf, pagesize=letter)
  ancho, alto = letter
  x0, x1 = 54, ancho - 54

  # Encabezado negro
  c.setFillColor(NEGRO); c.rect(0, alto - 130, ancho, 130, fill=1, stroke=0)
  c.setFillColor(HexColor("#ffffff"))
  c.setFont("Helvetica-Bold", 22); c.drawString(x0, alto - 62, "NAVY TRAINING CENTER")
  c.setFont("Helvetica", 10); c.setFillColor(CLARO); c.drawString(x0, alto - 80, "Comprobante de pago")
  c.setFont("Helvetica-Bold", 12); c.setFillColor(HexColor("#ffffff"))
  c.drawRightString(x1, alto - 62, pago.get("folio") or "")
  estatus = {"Completado": "PAGADO", "Reembolsado": "REEMBOLSADO", "Fallido": "NO COBRADO"}.get(pago.get("estatus"), (pago.get("estatus") or "").upper())
  c.setFont("Helvetica", 10); c.setFillColor(CLARO); c.drawRightString(x1, alto - 80, estatus)

  # Monto
  y = alto - 190
  c.setFillColor(GRIS); c.setFont("Helvetica", 10); c.drawString(x0, y, "TOTAL")
  c.setFillColor(NEGRO); c.setFont("Helvetica-Bold", 30); c.drawString(x0, y - 34, dinero(pago.get("monto")))

  # Detalle
  fecha = pago.get("fecha_pago")
  try:
    f = datetime.fromisoformat(str(fecha).replace("Z", "+00:00")).astimezone(CDMX)
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    fecha_txt = f"{f.day} de {meses[f.month - 1]} de {f.year}, {f.strftime('%H:%M')} h"
  except Exception:
    fecha_txt = str(fecha or "—")

  filas = [
    ("Concepto", pago.get("concepto") or "Pago"),
    ("Fecha y hora", fecha_txt),
    ("Cliente", cliente.get("nombre_completo") or "—"),
    ("Correo", cliente.get("email") or "—"),
    ("Sucursal", sucursal or "—"),
    ("Método de pago", pago.get("metodo_pago") or "—"),
    ("Folio", pago.get("folio") or "—"),
  ]
  if detalle and detalle.get("vigencia"):
    filas.insert(1, ("Vigencia", detalle["vigencia"]))
  if pago.get("stripe_payment_intent_id") or pago.get("stripe_invoice_id"):
    filas.append(("Referencia Stripe", (pago.get("stripe_invoice_id") or pago.get("stripe_payment_intent_id"))))

  y -= 80
  for etiqueta, valor in filas:
    c.setStrokeColor(LINEA); c.line(x0, y + 14, x1, y + 14)
    c.setFillColor(GRIS); c.setFont("Helvetica", 10); c.drawString(x0, y, etiqueta)
    c.setFillColor(NEGRO); c.setFont("Helvetica-Bold", 10)
    texto = str(valor)
    c.drawRightString(x1, y, texto if len(texto) <= 70 else texto[:67] + "…")
    y -= 28
  c.setStrokeColor(LINEA); c.line(x0, y + 14, x1, y + 14)

  # Pie
  c.setFillColor(CLARO); c.setFont("Helvetica", 8)
  c.drawString(x0, 60, "Este comprobante no es una factura fiscal. Si necesitas factura, solicítala en recepción.")
  c.drawString(x0, 48, f"Generado el {datetime.now(CDMX).strftime('%d/%m/%Y %H:%M')} · navytrainingcenter.com")
  c.showPage(); c.save()
  return buf.getvalue()