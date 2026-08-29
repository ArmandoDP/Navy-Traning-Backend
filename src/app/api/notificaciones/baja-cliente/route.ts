import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { nombre, email, motivo, comentario } = await req.json()

  // Email al equipo de Navy
  await resend.emails.send({
    from:    'Navy Training Center <noreply@navytrainingcenter.com>',
    to:      'hola@navytrainingcenter.com',
    subject: `⚠️ Baja de cliente — ${nombre}`,
    html: `
      <div style="font-family:Arial,sans-serif;background:#000;padding:40px 20px;">
        <div style="max-width:500px;margin:0 auto;background:#111;border-radius:16px;padding:32px;">
          <p style="color:#fff;font-size:20px;font-weight:900;margin:0 0 24px;">⚠️ Un cliente eliminó su cuenta</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="color:#6b7280;padding:8px 0;font-size:14px;">Nombre</td><td style="color:#fff;font-size:14px;font-weight:700;">${nombre}</td></tr>
            <tr><td style="color:#6b7280;padding:8px 0;font-size:14px;">Email</td><td style="color:#fff;font-size:14px;">${email}</td></tr>
            <tr><td style="color:#6b7280;padding:8px 0;font-size:14px;">Motivo</td><td style="color:#fff;font-size:14px;font-weight:700;">${motivo}</td></tr>
            ${comentario ? `<tr><td style="color:#6b7280;padding:8px 0;font-size:14px;">Comentario</td><td style="color:#fff;font-size:14px;">${comentario}</td></tr>` : ''}
          </table>
        </div>
      </div>
    `,
  })

  return NextResponse.json({ success: true })
}