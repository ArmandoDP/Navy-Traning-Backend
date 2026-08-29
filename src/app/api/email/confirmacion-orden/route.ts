import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { email, nombre, paquete, monto, sucursal, fecha } = await req.json()

  try {
    await resend.emails.send({
      from: 'Navy Training Center <noreply@navytrainingcenter.com>',
      to:      email,
      subject: '¡Tu membresía está confirmada! 🏋️ Navy Training Center',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <!-- Header negro -->
          <tr>
            <td style="background:#171B24;padding:40px;text-align:center;">
              <p style="margin:0;color:#fff;font-size:28px;font-weight:900;letter-spacing:-1px;">NAVY</p>
              <p style="margin:4px 0 0;color:#9ca3af;font-size:11px;letter-spacing:4px;text-transform:uppercase;">Training Center</p>
            </td>
          </tr>

          <!-- Check verde -->
          <tr>
            <td style="background:#171B24;padding:0 40px 40px;text-align:center;">
              <div style="width:64px;height:64px;background:#22c55e;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:20px;">
                <span style="color:#fff;font-size:32px;line-height:64px;">✓</span>
              </div>
              <p style="margin:0;color:#fff;font-size:24px;font-weight:900;">¡Bienvenido, ${nombre}!</p>
              <p style="margin:8px 0 0;color:#9ca3af;font-size:15px;">Tu membresía está confirmada y activa.</p>
            </td>
          </tr>

          <!-- Detalle orden -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;font-size:13px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;">Detalle de tu orden</p>

              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f3f4f6;border-radius:16px;overflow:hidden;">
                ${[
                  { label: 'Plan',      val: paquete },
                  { label: 'Sucursal',  val: sucursal },
                  { label: 'Monto',     val: `$${Number(monto).toLocaleString('es-MX')} MXN` },
                  { label: 'Fecha',     val: new Date(fecha).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
                  { label: 'Estatus',   val: '✓ Pagado' },
                ].map((r, i) => `
                  <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#fff'};">
                    <td style="padding:14px 20px;font-size:13px;color:#6b7280;font-weight:500;">${r.label}</td>
                    <td style="padding:14px 20px;font-size:13px;color:#111;font-weight:700;text-align:right;">${r.val}</td>
                  </tr>
                `).join('')}
              </table>

              <!-- Banner Founding Member -->
              <div style="margin-top:24px;background:#171B24;border-radius:16px;padding:24px;text-align:center;">
                <p style="margin:0;color:#9ca3af;font-size:11px;letter-spacing:3px;text-transform:uppercase;">Founding Member</p>
                <p style="margin:8px 0 0;color:#fff;font-size:20px;font-weight:900;">Precio bloqueado de por vida 🔒</p>
                <p style="margin:8px 0 0;color:#9ca3af;font-size:13px;">Eres parte de los primeros miembros de Navy Training Center.</p>
              </div>

              <!-- Próximos pasos -->
              <p style="margin:32px 0 16px;font-size:13px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;">Próximos pasos</p>
              ${[
                { num: '1', txt: 'Descarga la app de Navy Training Center' },
                { num: '2', txt: 'Inicia sesión con tu correo y contraseña temporal' },
                { num: '3', txt: 'Reserva tu primera clase y elige tu spot' },
                { num: '4', txt: 'Llega 10 minutos antes y muestra tu QR en recepción' },
              ].map(p => `
                <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px;">
                  <div style="width:28px;height:28px;background:#171B24;border-radius:50%;flex-shrink:0;text-align:center;line-height:28px;">
                    <span style="color:#fff;font-size:12px;font-weight:900;">${p.num}</span>
                  </div>
                  <p style="margin:4px 0 0;font-size:14px;color:#374151;">${p.txt}</p>
                </div>
              `).join('')}

              <!-- CTA -->
              <div style="text-align:center;margin-top:32px;">
                <a href="https://navytrainingcenter.com" 
                  style="display:inline-block;background:#171B24;color:#fff;font-size:15px;font-weight:700;padding:16px 40px;border-radius:14px;text-decoration:none;">
                  Ir a Navy Training →
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Navy Training Center · ${sucursal}<br/>
                ¿Tienes dudas? Escríbenos a <a href="mailto:hola@navytrainingcenter.com" style="color:#171B24;font-weight:700;">hola@navytrainingcenter.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Error enviando email:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}