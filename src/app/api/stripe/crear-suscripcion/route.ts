import { NextRequest, NextResponse } from 'next/server'
import { stripe }   from '@/lib/stripe'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { cliente_id, paquete_id, payment_method_id } = await req.json()

  // Obtener cliente y paquete
  const [{ data: cliente }, { data: paquete }] = await Promise.all([
    supabase.from('clientes').select('*, paquete_precios:paquetes(nombre)').eq('id', cliente_id).single(),
    supabase.from('paquetes').select('*, paquete_precios(precio_app)').eq('id', paquete_id).single(),
  ])

  if (!cliente?.stripe_customer_id) {
    // Crear customer en Stripe si no tiene
    const customer = await stripe.customers.create({
      email: cliente?.email,
      name:  cliente?.nombre_completo,
    })
    await supabase.from('clientes').update({ stripe_customer_id: customer.id }).eq('id', cliente_id)
    cliente.stripe_customer_id = customer.id
  }

  const precio = paquete?.paquete_precios?.[0]?.precio_app || 0

  // Crear price en Stripe on-the-fly
  const stripePrice = await stripe.prices.create({
    currency:    'mxn',
    unit_amount: precio * 100,
    recurring:   { interval: 'month' },
    product_data:{ name: paquete?.nombre || 'Membresía Navy' },
  })

  // Setear método de pago por default
  await stripe.paymentMethods.attach(payment_method_id, {
    customer: cliente.stripe_customer_id,
  })
  await stripe.customers.update(cliente.stripe_customer_id, {
    invoice_settings: { default_payment_method: payment_method_id },
  })

  // Crear suscripción
  const suscripcion = await stripe.subscriptions.create({
    customer:               cliente.stripe_customer_id,
    items:                  [{ price: stripePrice.id }],
    default_payment_method: payment_method_id,
    payment_behavior:       'default_incomplete',
    expand:                 ['latest_invoice.payment_intent'],
  })

  const invoice     = suscripcion.latest_invoice as any
  const clientSecret = invoice?.payment_intent?.client_secret

  // Crear membresía en Supabase
  const hoy      = new Date()
  const fechaFin = new Date(hoy)
  fechaFin.setDate(fechaFin.getDate() + (paquete?.vigencia_dias || 30))

  await supabase.from('membresias').insert({
    cliente_id:              cliente_id,
    paquete_id:              paquete_id,
    fecha_inicio:            hoy.toISOString().split('T')[0],
    fecha_fin:               fechaFin.toISOString().split('T')[0],
    estatus:                 'Activa',
    precio_pagado:           precio,
    origen:                  'App',
    stripe_subscription_id:  suscripcion.id,
  })

  await supabase.from('clientes').update({
    paquete_id:              paquete_id,
    stripe_subscription_id:  suscripcion.id,
  }).eq('id', cliente_id)

  // Registrar pago
  await supabase.from('pagos').insert({
    cliente_id:              cliente_id,
    monto:                   precio,
    estatus:                 'Completado',
    metodo_pago:             'Tarjeta',
    concepto:                `${paquete?.nombre} — inscripción`,
    fecha_pago:              new Date().toISOString(),
    canal:                   'App',
    stripe_subscription_id:  suscripcion.id,
    stripe_customer_id:      cliente.stripe_customer_id,
  })

  return NextResponse.json({ success: true, clientSecret, suscripcionId: suscripcion.id })
}