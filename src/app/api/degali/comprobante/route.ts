import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabase } from '@/lib/supabase'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { ventaId, email, nombre, carrito, total, metodoPago, numeroOperacion, sucursalId } = await req.json()

  const { data: sucursal } = await supabase
    .from('sucursales').select('nombre').eq('id', sucursalId).single()

  const fecha = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })

  const itemsHtml = carrito.map((i: any) => `
    <tr>
      <td style="padding:8px 0;color:#374151;font-size:14px">${i.nombre}</td>
      <td style="padding:8px 0;color:#374151;font-size:14px;text-align:center">${i.cantidad}</td>
      <td style="padding:8px 0;color:#374151;font-size:14px;text-align:right">$${i.precio_sucursal.toLocaleString('es-MX')}</td>
      <td style="padding:8px 0;color:#111;font-weight:700;font-size:14px;text-align:right">$${(i.precio_sucursal * i.cantidad).toLocaleString('es-MX')}</td>
    </tr>
  `).join('')

  await resend.emails.send({
    from:    'Navy Training Center <noreply@navytrainingcenter.com>',
    to:      email,
    subject: `Comprobante THE GALLEY · #${ventaId.slice(0,8).toUpperCase()}`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;padding:0 16px">

    <div style="background:linear-gradient(135deg,#171B24 0%,#1e2433 100%);border-radius:20px 20px 0 0;padding:36px 32px;text-align:center">
      <p style="color:#fff;font-size:28px;font-weight:900;margin:0;letter-spacing:4px">NAVY</p>
      <p style="color:#4b5563;font-size:10px;font-weight:700;margin:4px 0 0;letter-spacing:6px">THE GALLEY · SMOOTHIE BAR</p>
      <div style="margin-top:16px;background:rgba(255,255,255,0.08);border-radius:10px;padding:10px 20px;display:inline-block">
        <p style="color:#9ca3af;font-size:12px;margin:0">Comprobante <strong style="color:#fff">#${ventaId.slice(0,8).toUpperCase()}</strong></p>
      </div>
    </div>

    <div style="background:#fff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">

      <p style="color:#111;font-size:18px;font-weight:900;margin:0 0 4px">¡Gracias, ${nombre?.split(' ')[0] || 'cliente'}! 🧃</p>
      <p style="color:#6b7280;font-size:13px;margin:0 0 24px">${fecha} · ${sucursal?.nombre || ''}</p>

      <!-- Productos -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <thead>
          <tr style="border-bottom:2px solid #f3f4f6">
            <th style="padding:8px 0;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Producto</th>
            <th style="padding:8px 0;text-align:center;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Cant.</th>
            <th style="padding:8px 0;text-align:right;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Precio</th>
            <th style="padding:8px 0;text-align:right;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Subtotal</th>
          </tr>
        </thead>
        <tbody style="border-bottom:1px solid #f3f4f6">
          ${itemsHtml}
        </tbody>
      </table>

      <!-- Total -->
      <div style="background:#f9fafb;border-radius:12px;padding:16px 20px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span style="color:#6b7280;font-size:13px">Subtotal</span>
          <span style="color:#111;font-size:13px;font-weight:700">$${total.toLocaleString('es-MX')}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span style="color:#6b7280;font-size:13px">IVA (incluido)</span>
          <span style="color:#111;font-size:13px;font-weight:700">$${(total * 0.16 / 1.16).toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid #e5e7eb;padding-top:10px;margin-top:4px">
          <span style="color:#111;font-size:16px;font-weight:900">Total</span>
          <span style="color:#111;font-size:20px;font-weight:900">$${total.toLocaleString('es-MX')}</span>
        </div>
      </div>

      <!-- Pago -->
      <div style="background:#171B24;border-radius:12px;padding:16px 20px;margin-bottom:24px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <p style="color:#9ca3af;font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px">Método de pago</p>
            <p style="color:#fff;font-size:14px;font-weight:700;margin:0;text-transform:capitalize">${metodoPago === 'efectivo' ? '💵 Efectivo' : '💳 Terminal'}</p>
          </div>
          ${numeroOperacion ? `
          <div style="text-align:right">
            <p style="color:#9ca3af;font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px">No. operación</p>
            <p style="color:#fff;font-size:14px;font-weight:700;margin:0;font-family:monospace">${numeroOperacion}</p>
          </div>` : ''}
        </div>
      </div>

      <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">
        Gracias por tu compra en Navy Training Center · THE GALLEY Smoothie Bar
      </p>
    </div>

    <div style="background:#f9fafb;border-radius:0 0 20px 20px;padding:16px 32px;text-align:center;border:1px solid #e5e7eb;border-top:none">
      <p style="color:#9ca3af;font-size:11px;margin:0">© 2026 Navy Training Center · Todos los derechos reservados</p>
    </div>
  </div>
</body>
</html>
    `,
  })

  return NextResponse.json({ ok: true })
}