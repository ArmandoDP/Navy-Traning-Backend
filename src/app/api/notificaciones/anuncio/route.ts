import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { titulo, cuerpo, scope, sucursal_id } = await req.json()

  // Traer tokens de push de los clientes según alcance
  let qTokens = supabase
    .from('push_tokens')
    .select('token, clientes(sucursal_id)')

  const { data: tokens } = await qTokens

  const filtrados = scope === 'sucursal'
    ? tokens?.filter((t: any) => t.clientes?.sucursal_id === sucursal_id)
    : tokens

  if (!filtrados || filtrados.length === 0) {
    return NextResponse.json({ success: true, enviados: 0 })
  }

  // Enviar push via Expo
  const messages = filtrados.map((t: any) => ({
    to:    t.token,
    title: `🏋️ Navy Training — ${titulo}`,
    body:  cuerpo,
    data:  { tipo: 'anuncio' },
  }))

  const chunks = []
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100))
  }

  for (const chunk of chunks) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(chunk),
    })
  }

  return NextResponse.json({ success: true, enviados: filtrados.length })
}