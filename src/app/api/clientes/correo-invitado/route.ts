import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabase } from '@/lib/supabase'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { email, nombre, password_temporal, titular_id } = await req.json()

  const { data: titular } = await supabase
    .from('clientes')
    .select('nombre_completo, paquetes(nombre)')
    .eq('id', titular_id)
    .single()

  await resend.emails.send({
    from:    'Navy Training Center <noreply@navytrainingcenter.com>',
    to:      email,
    subject: '¡Fuiste invitado a Navy Training Center! 🏋️',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <div style="background:#171B24;padding:32px;text-align:center;border-radius:16px 16px 0 0">
          <p style="color:#fff;font-size:24px;font-weight:900;margin:0">NAVY</p>
          <p style="color:#9ca3af;font-size:11px;letter-spacing:4px;margin:4px 0 0">TRAINING CENTER</p>
        </div>
        <div style="background:#fff;padding:32px;border-radius:0 0 16px 16px;border:1px solid #f3f4f6">
          <h2 style="color:#111;font-size:22px;font-weight:900">¡Hola ${nombre}! 👋</h2>
          <p style="color:#6b7280;font-size:15px;line-height:24px">
            <strong>${titular?.nombre_completo}</strong> te ha invitado como usuario adicional en su membresía 
            <strong>${(titular?.paquetes as any)?.nombre}</strong> en Navy Training Center.
          </p>
          <p style="color:#6b7280;font-size:15px">Tendrás acceso a todas las clases y beneficios incluidos en el paquete, sin costo adicional.</p>
          
          <div style="background:#f9fafb;border-radius:12px;padding:20px;margin:24px 0">
            <p style="font-size:13px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px">Tus credenciales de acceso</p>
            <p style="font-size:14px;color:#111;margin:0 0 8px"><strong>Usuario:</strong> ${email}</p>
            <p style="font-size:14px;color:#111;margin:0"><strong>Contraseña temporal:</strong> ${password_temporal}</p>
          </div>

          <p style="color:#6b7280;font-size:13px">Descarga la app de Navy Training Center, inicia sesión y cambia tu contraseña en el primer acceso.</p>

          <div style="text-align:center;margin-top:24px">
            <a href="https://navytrainingcenter.com" 
              style="background:#171B24;color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px">
              Descargar la app →
            </a>
          </div>
        </div>
      </div>
    `,
  })

  return NextResponse.json({ success: true })
}