import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { email, nombre, password, empleado } = await req.json()

  const logoUrl  = 'https://crm.navytrainingcenter.com/logo-navy.svg'
  const sucursales = empleado?.staff_sucursales
    ?.map((ss: any) => ss.sucursales?.nombre)
    .filter(Boolean)
    .join(' · ') || '—'

  const fechaIngreso = empleado?.fecha_ingreso
    ? new Date(empleado.fecha_ingreso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  await resend.emails.send({
    from:    'Navy Training Center <noreply@navytrainingcenter.com>',
    to:      email,
    subject: `${nombre}, aquí están tus credenciales de Navy CRM 🔐`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:580px;margin:40px auto;padding:0 16px">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#171B24 0%,#1e2433 100%);border-radius:20px 20px 0 0;padding:40px 32px;text-align:center">
      <img src="${logoUrl}" alt="Navy" style="height:44px;margin-bottom:20px" />
      <br>
      <div style="display:inline-block;background:rgba(255,255,255,0.08);border-radius:100px;padding:6px 16px;margin-bottom:12px">
        <span style="color:#9ca3af;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase">Acceso al CRM</span>
      </div>
      <h1 style="color:#fff;font-size:26px;font-weight:900;margin:0;line-height:1.3">
        ¡Bienvenido al equipo,<br>${nombre}! 💪
      </h1>
    </div>

    <!-- Body -->
    <div style="background:#fff;padding:36px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">

      <p style="color:#6b7280;font-size:15px;line-height:24px;margin:0 0 28px">
        Tu acceso al CRM de Navy Training Center ha sido configurado. A continuación encontrarás tus datos y credenciales de acceso.
      </p>

      <!-- Perfil -->
      <div style="background:#f9fafb;border-radius:16px;padding:24px;margin-bottom:20px;border:1px solid #f3f4f6">
        <p style="font-size:11px;font-weight:700;color:#9ca3af;margin:0 0 16px;text-transform:uppercase;letter-spacing:2px">
          Tu perfil
        </p>
        <div style="display:grid;gap:10px">
          ${renderRow('👤', 'Nombre', `${empleado?.nombre || ''} ${empleado?.primer_apellido || ''}`.trim())}
          ${renderRow('✉️', 'Correo', email)}
          ${empleado?.telefono ? renderRow('📱', 'Teléfono', empleado.telefono) : ''}
          ${fechaIngreso ? renderRow('📅', 'Fecha de ingreso', fechaIngreso) : ''}
          ${renderRow('🏷️', 'Tipo', empleado?.tipo || '—')}
          ${empleado?.nivel ? renderRow('⭐', 'Nivel', empleado.nivel) : ''}
          ${empleado?.staff_sucursales?.length > 0 ? renderRow('📍', 'Sucursales', sucursales) : ''}
        </div>
      </div>

      <!-- Credenciales -->
      <div style="background:#171B24;border-radius:16px;padding:24px;margin-bottom:20px">
        <p style="font-size:11px;font-weight:700;color:#6b7280;margin:0 0 16px;text-transform:uppercase;letter-spacing:2px">
          Credenciales de acceso
        </p>
        <div style="gap:12px;display:grid">
          ${renderRowDark('🌐', 'Portal', 'crm.navytrainingcenter.com')}
          ${renderRowDark('👤', 'Usuario', email)}
          ${renderRowDark('🔑', 'Contraseña temporal', password, true)}
        </div>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:24px">
        <a href="https://crm.navytrainingcenter.com"
          style="display:inline-block;background:#171B24;color:#fff;font-weight:700;font-size:14px;padding:14px 32px;border-radius:12px;text-decoration:none">
          Iniciar sesión en el CRM →
        </a>
      </div>

      <!-- Aviso -->
      <div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border-radius:12px;padding:16px;margin-bottom:24px">
        <p style="font-size:13px;color:#92400e;margin:0;font-weight:600;line-height:20px">
          ⚠️ <strong>Importante:</strong> Al iniciar sesión por primera vez se te pedirá cambiar tu contraseña temporal. Elige una contraseña segura que no compartas con nadie.
        </p>
      </div>

      <p style="color:#9ca3af;font-size:12px;line-height:20px;margin:0;border-top:1px solid #f3f4f6;padding-top:20px">
        ¿Alguno de tus datos es incorrecto? Por favor dirígete a recepción o contacta a tu manager para hacer la corrección correspondiente.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;border-radius:0 0 20px 20px;padding:20px 32px;text-align:center;border:1px solid #e5e7eb;border-top:none">
      <p style="color:#9ca3af;font-size:11px;margin:0">
        © 2026 Navy Training Center · Todos los derechos reservados
      </p>
    </div>

  </div>
</body>
</html>
    `,
  })

  return NextResponse.json({ ok: true })
}

function renderRow(icon: string, label: string, value: string) {
  return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f3f4f6">
      <span style="font-size:16px;width:24px;text-align:center">${icon}</span>
      <span style="color:#9ca3af;font-size:13px;width:140px;flex-shrink:0">${label}</span>
      <span style="color:#111;font-size:13px;font-weight:700;flex:1">${value}</span>
    </div>
  `
}

function renderRowDark(icon: string, label: string, value: string, mono = false) {
  return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
      <span style="font-size:16px;width:24px;text-align:center">${icon}</span>
      <span style="color:#6b7280;font-size:13px;width:140px;flex-shrink:0">${label}</span>
      <span style="color:#fff;font-size:13px;font-weight:700;flex:1;${mono ? 'font-family:monospace;letter-spacing:2px;font-size:15px' : ''}">${value}</span>
    </div>
  `
}