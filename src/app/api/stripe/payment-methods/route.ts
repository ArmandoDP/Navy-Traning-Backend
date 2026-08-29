import { NextRequest, NextResponse } from 'next/server'
import { stripe }   from '@/lib/stripe'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clienteId = searchParams.get('cliente_id')
  if (!clienteId) return NextResponse.json({ error: 'cliente_id requerido' }, { status: 400 })

  const { data: cliente } = await supabase
    .from('clientes').select('stripe_customer_id').eq('id', clienteId).single()

  if (!cliente?.stripe_customer_id)
    return NextResponse.json({ paymentMethods: [] })

  const pms = await stripe.paymentMethods.list({
    customer: cliente.stripe_customer_id,
    type:     'card',
  })

  return NextResponse.json({ paymentMethods: pms.data })
}

export async function POST(req: NextRequest) {
  const { cliente_id, payment_method_id } = await req.json()

  const { data: cliente } = await supabase
    .from('clientes').select('stripe_customer_id').eq('id', cliente_id).single()

  if (!cliente?.stripe_customer_id)
    return NextResponse.json({ error: 'Cliente sin stripe_customer_id' }, { status: 400 })

  await stripe.paymentMethods.attach(payment_method_id, {
    customer: cliente.stripe_customer_id,
  })

  await stripe.customers.update(cliente.stripe_customer_id, {
    invoice_settings: { default_payment_method: payment_method_id },
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const { payment_method_id } = await req.json()
  await stripe.paymentMethods.detach(payment_method_id)
  return NextResponse.json({ success: true })
}