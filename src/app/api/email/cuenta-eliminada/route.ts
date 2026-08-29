import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { nombre, email } = await req.json()

  await resend.emails.send({
    from:    'Navy Training Center <noreply@navytrainingcenter.com>',
    to:      email,
    subject: 'Tu cuenta de Navy Training Center ha sido eliminada',
    html: `
      <html>
      <body style="margin:0;padding:0;background:#000;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#000;padding:40px 20px;">
          <tr><td align="center">
            <table width="500" cellpadding="0" cellspacing="0" style="background:#111;border-radius:20px;overflow:hidden;">
              <tr>
                <td style="padding:36px;text-align:center;">
                  <img src="https://crm.navytrainingcenter.com/logo-navy.svg" width="110" style="display:block;margin:0 auto 28px;" />
                  <p style="margin:0 0 8px;font-size:32px;">✓</p>
                  <p style="margin:0 0 12px;color:#fff;font-size:24px;font-weight:900;">Cuenta eliminada</p>
                  <p style="margin:0 0 28px;color:#6b7280;font-size:15px;line-height:24px;">
                    Hola ${nombre}, tu cuenta de Navy Training Center ha sido eliminada exitosamente. Todos tus datos personales han sido borrados de nuestros sistemas.
                  </p>
                  <p style="margin:0;color:#4b5563;font-size:13px;line-height:22px;">
                    Si esto fue un error o cambias de opinión, puedes crear una nueva cuenta en cualquier momento.<br/>
                    ¿Tienes dudas? Escríbenos a <a href="mailto:hola@navytrainingcenter.com" style="color:#fff;">hola@navytrainingcenter.com</a>
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#060606;padding:20px 36px;text-align:center;border-top:1px solid #222;">
                  <p style="margin:0;font-size:12px;color:#4b5563;">Navy Training Center</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `,
  })

  return NextResponse.json({ success: true })
} 