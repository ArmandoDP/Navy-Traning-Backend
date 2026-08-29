import { NextRequest, NextResponse } from 'next/server'
import { stripe }                    from '@/lib/stripe'
import { supabase }                  from '@/lib/supabase'

// Helper para buscar cliente por stripe_customer_id
async function findCliente(stripeCustomerId: string) {
  if (!stripeCustomerId) return null
  const { data } = await supabase
    .from('clientes')
    .select('id, nombre_completo')
    .eq('stripe_customer_id', stripeCustomerId)
    .single()
  return data
}

export async function POST(req: NextRequest) {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: any

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error('Webhook signature error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 400 })
  }

  try {
    switch (event.type) {

      // ── Pago exitoso ──────────────────────────────────────────────────────
      case 'payment_intent.succeeded': {
        const pi = event.data.object

        // Si viene de un checkout session (Founding Member), no duplicar
        if (pi.metadata?.plan_type === 'founding_member') break

        // Verificar si ya existe este payment_intent
        const { data: existe } = await supabase
          .from('pagos')
          .select('id')
          .eq('stripe_payment_intent_id', pi.id)
          .single()

        if (existe) break // ya existe, no duplicar

        const cliente = await findCliente(pi.customer)
        await supabase.from('pagos').insert({
          stripe_payment_intent_id: pi.id,
          cliente_id:               cliente?.id || null,
          cliente_stripe_id:        pi.customer || null,
          monto:                    pi.amount / 100,
          moneda:                   pi.currency.toUpperCase(),
          estatus:                  'Completado',
          metodo_pago:              pi.payment_method_types?.[0] || 'card',
          concepto:                 pi.description || 'Pago con tarjeta',
          fecha_pago:               new Date(pi.created * 1000).toISOString(),
          metadata:                 pi.metadata || {},
        })
        break
      }

      // ── Pago fallido ──────────────────────────────────────────────────────
      case 'payment_intent.payment_failed': {
        const pi      = event.data.object
        const cliente = await findCliente(pi.customer)
        await supabase.from('pagos').insert({
          stripe_payment_intent_id: pi.id,
          cliente_id:               cliente?.id || null,
          cliente_stripe_id:        pi.customer || null,
          monto:                    pi.amount / 100,
          moneda:                   pi.currency.toUpperCase(),
          estatus:                  'Fallido',
          metodo_pago:              pi.payment_method_types?.[0] || 'card',
          concepto:                 'Pago fallido',
          fecha_pago:               new Date(pi.created * 1000).toISOString(),
          metadata:                 pi.metadata || {},
        })
        await supabase.from('alertas').insert({
          tipo:        'pago_fallido',
          categoria:   'operacion',
          titulo:      `Pago fallido${cliente ? ` — ${cliente.nombre_completo}` : ''} — $${(pi.amount / 100).toLocaleString()}`,
          descripcion: pi.last_payment_error?.message || 'El pago fue rechazado',
          cliente_id:  cliente?.id || null,
          metadata:    { stripe_payment_intent_id: pi.id },
        })
        break
      }

      // ── Suscripción creada ────────────────────────────────────────────────
      case 'customer.subscription.created': {
        const sub     = event.data.object
        const cliente = await findCliente(sub.customer)

        // NO insertar pago — checkout.session.completed ya lo maneja
        // Solo actualizar estatus del cliente
        if (cliente) {
          await supabase.from('clientes')
            .update({ estatus: 'Activo' })
            .eq('id', cliente.id)
        }
        break
      }

      // ── Suscripción actualizada ───────────────────────────────────────────
      case 'customer.subscription.updated': {
        const sub     = event.data.object
        const cliente = await findCliente(sub.customer)
        if (cliente) {
          const nuevoEstatus = sub.status === 'active'   ? 'Activo'
            : sub.status === 'past_due'                  ? 'Vencido'
            : sub.status === 'canceled'                  ? 'Inactivo'
            : sub.status === 'paused'                    ? 'Inactivo'
            : null
          if (nuevoEstatus) {
            await supabase.from('clientes')
              .update({ estatus: nuevoEstatus })
              .eq('id', cliente.id)
          }
        }
        break
      }

      // ── Suscripción cancelada ─────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub     = event.data.object
        const cliente = await findCliente(sub.customer)
        if (cliente) {
          await supabase.from('clientes')
            .update({ estatus: 'Inactivo' })
            .eq('id', cliente.id)
          await supabase.from('alertas').insert({
            tipo:        'membresia_vence',
            categoria:   'vencimiento',
            titulo:      `Suscripción cancelada — ${cliente.nombre_completo}`,
            descripcion: 'La suscripción fue cancelada en Stripe',
            cliente_id:  cliente.id,
            metadata:    { stripe_subscription_id: sub.id },
          })
        }
        break
      }

      // ── Factura pagada (renovación) ───────────────────────────────────────
      case 'invoice.payment_succeeded': {
        const inv     = event.data.object
        const cliente = await findCliente(inv.customer)
        if (inv.billing_reason === 'subscription_cycle') {
          await supabase.from('pagos').insert({
            stripe_invoice_id:  inv.id,
            stripe_customer_id: inv.customer,
            cliente_id:         cliente?.id || null,
            monto:              inv.amount_paid / 100,
            moneda:             inv.currency.toUpperCase(),
            estatus:            'Exitoso',
            concepto:           'Renovación automática',
            metodo_pago:        'Tarjeta',
            fecha_pago:         new Date(inv.created * 1000).toISOString(),
            metadata:           { stripe_invoice_id: inv.id },
          })
        }
        break
      }

      // ── Factura creada ────────────────────────────────────────────────────
      case 'invoice.created': {
        const inv = event.data.object
        console.log(`Factura creada: ${inv.id} — $${inv.amount_due / 100}`)
        break
      }

      // ── Factura fallida ───────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const inv     = event.data.object
        const cliente = await findCliente(inv.customer)
        await supabase.from('alertas').insert({
          tipo:        'pago_fallido',
          categoria:   'operacion',
          titulo:      `Pago fallido${cliente ? ` — ${cliente.nombre_completo}` : ''}`,
          descripcion: `$${(inv.amount_due / 100).toLocaleString()} · Fondos insuficientes`,
          cliente_id:  cliente?.id || null,
          metadata:    { stripe_invoice_id: inv.id, stripe_customer_id: inv.customer },
        })
        break
      }

      // ── Reembolso ─────────────────────────────────────────────────────────
      case 'charge.refunded': {
        const charge  = event.data.object
        const cliente = await findCliente(charge.customer)
        await supabase.from('pagos').insert({
          stripe_payment_intent_id: charge.payment_intent || null,
          stripe_customer_id:       charge.customer || null,
          cliente_id:               cliente?.id || null,
          monto:                    -(charge.amount_refunded / 100),
          moneda:                   charge.currency.toUpperCase(),
          estatus:                  'Reembolsado',
          metodo_pago:              'Tarjeta',
          concepto:                 'Reembolso',
          fecha_pago:               new Date(charge.created * 1000).toISOString(),
          metadata:                 { charge_id: charge.id },
        })
        await supabase.from('alertas').insert({
          tipo:        'pago_fallido',
          categoria:   'operacion',
          titulo:      `Reembolso procesado${cliente ? ` — ${cliente.nombre_completo}` : ''}`,
          descripcion: `$${(charge.amount_refunded / 100).toLocaleString()} reembolsados`,
          cliente_id:  cliente?.id || null,
          metadata:    { charge_id: charge.id },
        })
        break
      }

      // ── Contracargo (chargeback) ──────────────────────────────────────────
      case 'charge.dispute.created': {
        const dispute = event.data.object
        const cliente = await findCliente(dispute.charge)
        await supabase.from('alertas').insert({
          tipo:        'pago_fallido',
          categoria:   'operacion',
          titulo:      `⚠ Contracargo — $${(dispute.amount / 100).toLocaleString()}`,
          descripcion: `Razón: ${dispute.reason} · Estado: ${dispute.status}`,
          cliente_id:  cliente?.id || null,
          metadata:    { dispute_id: dispute.id, charge_id: dispute.charge },
        })
        break
      }

      // ── Cliente creado en Stripe ──────────────────────────────────────────
      case 'customer.created': {
        const customer = event.data.object
        // Si tiene email, intentar vincular con cliente existente
        if (customer.email) {
          const { data: cliente } = await supabase
            .from('clientes')
            .select('id')
            .eq('email', customer.email)
            .single()
          if (cliente) {
            await supabase.from('clientes')
              .update({ stripe_customer_id: customer.id })
              .eq('id', cliente.id)
          }
        }
        break
      }

      
      // ── Cliente eliminado en Stripe ───────────────────────────────────────
      case 'customer.deleted': {
        const customer = event.data.object
        const cliente  = await findCliente(customer.id)
        if (cliente) {
          await supabase.from('clientes')
            .update({ stripe_customer_id: null, estatus: 'Inactivo' })
            .eq('id', cliente.id)
        }
        break
      }

      // ── Método de pago agregado ───────────────────────────────────────────
      case 'payment_method.attached': {
        const pm = event.data.object
        console.log(`Método de pago agregado: ${pm.id} — ${pm.type} para customer ${pm.customer}`)
        break
      }

      // ── Checkout completado (Founding Member desde Webflow) ────────────────
      case 'checkout.session.completed': {
        const session = event.data.object  // ← primero session

        if (session.metadata?.plan_type === 'founding_member') {
          const customer      = await stripe.customers.retrieve(session.customer as string)
          const paqueteNombre = session.metadata?.paquete_nombre || 'Founding Promo'  // ← después

          const { data: paquete } = await supabase
            .from('paquetes')
            .select('id, nombre, vigencia_dias, precio')
            .eq('nombre', paqueteNombre)
            .eq('estatus', 'Activo')
            .single()

          const { data: sucursal } = await supabase
            .from('sucursales')
            .select('id')
            .ilike('nombre', session.metadata.sucursal)
            .single()

          const hoy      = new Date()
          const fechaFin = paquete?.vigencia_dias
            ? new Date(hoy.getTime() + paquete.vigencia_dias * 24 * 60 * 60 * 1000)
            : null

          // 1. Crear/actualizar cliente
          const { data: cliente, error: clienteError } = await supabase
            .from('clientes')
            .upsert({
              email:                        (customer as any).email,
              nombre_completo:              (customer as any).name,
              stripe_customer_id:           session.customer,
              stripe_subscription_id:       session.subscription,
              sucursal_origen:              session.metadata.sucursal,
              sucursal_id:                  sucursal?.id || null,
              paquete_id:                   paquete?.id || null,
              is_founding_member:           true,
              precio_bloqueado:             12000,
              precio_bloqueado_de_por_vida: true,
              fecha_inscripcion:            new Date().toISOString(),
              fecha_vencimiento_membresia:  fechaFin?.toISOString().split('T')[0] || null,
              estatus:                      'Activo',
              plan:                         paquete?.nombre || 'Founding Promo',
            }, { onConflict: 'email' })
            .select('id, nombre_completo')
            .single()

          if (clienteError) {
            console.error('Error en upsert de cliente:', JSON.stringify(clienteError))
          }

          // 2. Crear membresía
          if (cliente?.id && paquete?.id) {
            await supabase.from('membresias').insert({
              cliente_id:    cliente.id,
              paquete_id:    paquete.id,
              fecha_inicio:  hoy.toISOString().split('T')[0],
              fecha_fin:     fechaFin?.toISOString().split('T')[0] || null,
              origen:        'Webflow',
              estatus:       'Activa',
              precio_pagado: (session.amount_total || 0) / 100,
              notas:         'Alta automática — Founding Member (Webflow)',
            })
          }

          // 3. Registrar pago
          await supabase.from('pagos').insert({
            stripe_subscription_id: session.subscription,
            stripe_customer_id:     session.customer,
            cliente_id:             cliente?.id || null,
            monto:                  (session.amount_total || 0) / 100,
            moneda:                 session.currency?.toUpperCase() || 'MXN',
            estatus:                'Completado',
            metodo_pago:            'Tarjeta',
            concepto:               `${paquete?.nombre || 'Founding Member'} — inscripción`,
            fecha_pago:             new Date().toISOString(),
            metadata:               session.metadata || {},
          })

          // 4. Enviar email — al final cuando ya existe cliente ←
          if (cliente?.id && (customer as any).email) {
            try {
              await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email/confirmacion-orden`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email:    (customer as any).email,
                  nombre:   (customer as any).name?.split(' ')[0] || 'Miembro',
                  paquete:  paquete?.nombre || 'Founding Promo',
                  monto:    (session.amount_total || 0) / 100,
                  sucursal: session.metadata?.sucursal || 'Navy Training Center',
                  fecha:    new Date().toISOString(),
                }),
              })
            } catch (emailErr) {
              console.error('Error enviando email:', emailErr)
            }
          }

        } else {
          console.log('checkout.session.completed sin plan_type founding_member:', JSON.stringify(session.metadata))
        }
        break
      }

      default:
        console.log(`Evento no manejado: ${event.type}`)
    }

  } catch (err: any) {
    console.error('Error procesando webhook:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}