import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  const { data: user } = await supabaseAdmin.auth.admin.listUsers()
  const found = user.users.find(u => u.email === email)
  if (!found) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  await supabaseAdmin.auth.admin.updateUserById(found.id, { password })
  return NextResponse.json({ ok: true })
}