import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// Cliente con permisos de administrador de Supabase
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { email, nombre, password, empleado, staff_id } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Faltan campos obligatorios (email o password).' }, { status: 400 })
    }

    const cleanEmail = email.trim().toLowerCase()
    let userId: string | null = null

    // 1. Intentar crear el usuario en Supabase Auth
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: password,
      email_confirm: true,
      user_metadata: { nombre }
    })

    if (authError) {
      // Si el usuario ya existe, lo buscamos y actualizamos su contraseña
      if (authError.message.includes('already registered') || authError.message.includes('already exists') || authError.status === 422) {
        
        // Buscar el ID del usuario existente por su correo
        const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers()
        
        if (listError) {
          return NextResponse.json({ error: listError.message }, { status: 400 })
        }

        const existingUser = usersData.users.find(u => u.email?.toLowerCase() === cleanEmail)

        if (!existingUser) {
          return NextResponse.json({ error: 'El usuario existe pero no se pudo recuperar su ID.' }, { status: 404 })
        }

        // Actualizar la contraseña del usuario existente
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          existingUser.id,
          { password: password, email_confirm: true }
        )

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 400 })
        }

        userId = existingUser.id
      } else {
        return NextResponse.json({ error: authError.message }, { status: 400 })
      }
    } else {
      userId = authUser.user.id
    }

    // 2. Vincular el auth_id a la tabla 'staff'
    const idAEnviar = staff_id || empleado?.id
    if (idAEnviar && userId) {
      await supabaseAdmin
        .from('staff')
        .update({ auth_id: userId })
        .eq('id', idAEnviar)
    }

    // 3. Preparar variables para el correo
    const logoUrl = 'https://knigqmxpenteolnwomir.supabase.co/storage/v1/object/public/staff-documentos/Group%2021.png'
    const sucursales = empleado?.staff_sucursales
      ?.map((ss: any) => ss.sucursales?.nombre)
      .filter(Boolean)
      .join(' · ') || '—'

    const fechaIngreso = empleado?.fecha_ingreso
      ? new Date(empleado.fecha_ingreso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
      : null

    const nombreMostrado = nombre || `${empleado?.nombre || ''} ${empleado?.primer_apellido || ''}`.trim() || 'Colaborador'

    // 4. Enviar correo por Resend
    await resend.emails.send({
      from: 'Navy Training Center <noreply@navytrainingcenter.com>',
      to: cleanEmail,
      subject: `${nombreMostrado}, aquí están tus credenciales de Navy CRM 🔐`,
      html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:580px;margin:40px auto;padding:0 16px">

    <div style="background:linear-gradient(135deg,#171B24 0%,#1e2433 100%);border-radius:20px 20px 0 0;padding:40px 32px;text-align:center">
      <img src="${logoUrl}" alt="Navy" style="height:48px; whidth:auto; display:inline-block; margin-bottom:20px" />
      <br>
      <div style="display:inline-block;background:rgba(255,255,255,0.08);border-radius:100px;padding:6px 16px;margin-bottom:12px">
        <span style="color:#9ca3af;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase">Acceso al CRM</span>
      </div>
      <h1 style="color:#fff;font-size:26px;font-weight:900;margin:0;line-height:1.3">
        ¡Bienvenido al equipo,<br>${nombreMostrado}! 💪
      </h1>
    </div>

    <div style="background:#fff;padding:36px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">
      <p style="color:#6b7280;font-size:15px;line-height:24px;margin:0 0 28px">
        Tu acceso al CRM de Navy Training Center ha sido configurado o actualizado. A continuación encontrarás tus credenciales de acceso.
      </p>

      <div style="background:#171B24;border-radius:16px;padding:24px;margin-bottom:20px">
        <p style="font-size:11px;font-weight:700;color:#6b7280;margin:0 0 16px;text-transform:uppercase;letter-spacing:2px">
          Credenciales de acceso
        </p>
        <div style="gap:12px;display:grid">
          ${renderRowDark('🌐', 'Portal', 'crm.navytrainingcenter.com')}
          ${renderRowDark('👤', 'Usuario', cleanEmail)}
          ${renderRowDark('🔑', 'Contraseña temporal', password, true)}
        </div>
      </div>

      <div style="text-align:center;margin-bottom:24px">
        <a href="https://crm.navytrainingcenter.com"
          style="display:inline-block;background:#171B24;color:#fff;font-weight:700;font-size:14px;padding:14px 32px;border-radius:12px;text-decoration:none">
          Iniciar sesión en el CRM →
        </a>
      </div>

      <div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border-radius:12px;padding:16px;margin-bottom:24px">
        <p style="font-size:13px;color:#92400e;margin:0;font-weight:600;line-height:20px">
          ⚠️ <strong>Importante:</strong> Usa esta contraseña temporal para ingresar y cámbiala inmediatamente dentro de tu perfil.
        </p>
      </div>
    </div>

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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
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