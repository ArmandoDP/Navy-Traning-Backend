import { NextRequest, NextResponse } from 'next/server'
import { supabase }                  from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { titulo, mensaje, cliente_ids, filtro } = await req.json()

  // Obtener tokens según filtro
  let query = supabase.from('push_tokens').select('token, cliente_id')

  if (cliente_ids && cliente_ids.length > 0) {
    query = query.in('cliente_id', cliente_ids)
  }

  const { data: tokens, error } = await query
  if (error || !tokens?.length) return NextResponse.json({ error: 'No hay tokens' }, { status: 400 })

  // Enviar via Expo Push API
  const messages = tokens.map(t => ({
    to:    t.token,
    title: titulo,
    body:  mensaje,
    sound: 'default',
    data:  { tipo: filtro || 'manual' },
  }))

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body:    JSON.stringify(messages),
  })

  const data = await res.json()

  // Guardar log de notificación
  await supabase.from('notificaciones_log').insert(
    tokens.map(t => ({
      cliente_id: t.cliente_id,
      titulo,
      mensaje,
      canal:      'push',
      tipo:       filtro || 'manual',
    }))
  ).select()

  return NextResponse.json({ success: true, enviadas: tokens.length, data })
}