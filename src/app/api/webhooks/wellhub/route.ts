import { NextRequest, NextResponse } from 'next/server'
import { supabase }                  from '@/lib/supabase'
import { validarAccesoWellhub, confirmarBookingWellhub, actualizarCuposSlotWellhub } from '@/lib/wellhub'

export async function POST(req: NextRequest) {
  const body = await req.json()

  try {

    // ── CHECK-IN ─────────────────────────────────────────────────────────────
    if (body.event_type === 'checkin' || body.event_type === 'checkin-booking-occurred') {
      const user = body.event_data?.user

      if (!user?.unique_token) {
        return NextResponse.json({ error: 'unique_token faltante' }, { status: 400 })
      }

      const { data: clienteExistente } = await supabase
        .from('clientes')
        .select('id')
        .eq('email', user.email)
        .single()

      const { data: checkin } = await supabase.from('wellhub_checkins').insert({
        unique_token: user.unique_token,
        nombre:       user.first_name,
        apellido:     user.last_name,
        email:        user.email,
        telefono:     user.phone_number,
        gym_id:       body.event_data?.gym?.id?.toString(),
        cliente_id:   clienteExistente?.id || null,
        metadata:     body,
      }).select().single()

      try {
        await validarAccesoWellhub(user.unique_token)

        await supabase.from('wellhub_checkins')
          .update({ validado: true })
          .eq('id', checkin?.id)

        if (!clienteExistente) {
          await supabase.from('clientes').insert({
            nombre_completo: `${user.first_name} ${user.last_name}`,
            email:            user.email,
            telefono:         user.phone_number,
            estatus:          'Activo',
            plan:             'Wellhub',
          })
        }

        return NextResponse.json({ received: true, validado: true })

      } catch (errValidacion: any) {
        await supabase.from('alertas').insert({
          tipo:        'pago_fallido',
          categoria:   'operacion',
          titulo:      `Check-in Wellhub sin acceso válido — ${user.first_name} ${user.last_name}`,
          descripcion: errValidacion.message,
          metadata:    { unique_token: user.unique_token },
        })

        return NextResponse.json({ received: true, validado: false }, { status: 200 })
      }
    }

    // ── BOOKING REQUESTED ─────────────────────────────────────────────────────
    if (body.event_type === 'booking-requested') {
      const user = body.event_data?.user
      const slot = body.event_data?.slot

      if (!slot?.booking_number) {
        return NextResponse.json({ error: 'booking_number faltante' }, { status: 400 })
      }

      const { data: clase } = await supabase
        .from('clases')
        .select('id, capacidad_max, espacios_ocupados, nombre_clase, horario')
        .eq('wellhub_slot_id', String(slot.id))
        .single()

      const { data: clienteExistente } = await supabase
        .from('clientes')
        .select('id')
        .eq('email', user.email)
        .single()

      let clienteId = clienteExistente?.id
      if (!clienteExistente) {
        const { data: nuevoCliente } = await supabase.from('clientes').insert({
          nombre_completo: user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          email:            user.email,
          telefono:         user.phone_number,
          estatus:          'Activo',
          plan:             'Wellhub',
        }).select().single()
        clienteId = nuevoCliente?.id
      }

      const { data: booking } = await supabase.from('wellhub_bookings').insert({
        booking_number:   slot.booking_number,
        gympass_user_id:  user.unique_token,
        wellhub_slot_id:  String(slot.id),
        wellhub_class_id: String(slot.class_id),
        estatus:          'Pendiente',
        cliente_id:       clienteId,
        metadata:         body,
      }).select().single()

      const hayCupo = clase
        ? (clase.espacios_ocupados || 0) < clase.capacidad_max
        : true

      if (hayCupo) {
        try {
          const resultado = await confirmarBookingWellhub(slot.booking_number, slot.class_id, true)
          console.log('Booking confirmado en Wellhub:', resultado)

          await supabase.from('wellhub_bookings')
            .update({ estatus: 'Confirmado' })
            .eq('id', booking?.id)

          if (clase) {
            const nuevosOcupados = (clase.espacios_ocupados || 0) + 1

            await supabase.from('reservas').insert({
              clase_id:   clase.id,
              cliente_id: clienteId,
              estatus:    'Confirmada',
              origen:     'Wellhub',
            })

            await supabase.from('clases')
              .update({ espacios_ocupados: nuevosOcupados })
              .eq('id', clase.id)

            try {
              await actualizarCuposSlotWellhub(
                String(slot.id),
                nuevosOcupados,
                String(slot.class_id)
              )
            } catch (e: any) {
              console.error('Error actualizando cupos en Wellhub:', e.message)
            }
          }

        } catch (errConfirm: any) {
          console.error('❌ Error confirmando booking en Wellhub:', errConfirm.message)
        }
      } else {
        try {
          await confirmarBookingWellhub(slot.booking_number, slot.class_id, false)
          await supabase.from('wellhub_bookings')
            .update({ estatus: 'Rechazado' })
            .eq('id', booking?.id)

          await supabase.from('alertas').insert({
            tipo:        'lista_espera',
            categoria:   'operacion',
            titulo:      `Booking Wellhub rechazado — sin cupo`,
            descripcion: `${clase?.nombre_clase || 'Clase'} ya no tiene espacios disponibles`,
            cliente_id:  clienteId,
            metadata:    { booking_number: slot.booking_number },
          })
        } catch (errReject: any) {
          console.error('Error rechazando booking en Wellhub:', errReject.message)
        }
      }

      return NextResponse.json({ received: true })
    }

    // ── BOOKING CANCELATION ───────────────────────────────────────────────────
    if (body.event_type === 'booking-cancelation' || body.event_type === 'booking-late-cancelation') {
      const bookingNumber = body.event_data?.booking?.booking_number || body.event_data?.slot?.booking_number

      if (bookingNumber) {
        const { data: booking } = await supabase
          .from('wellhub_bookings')
          .select('id, cliente_id, wellhub_slot_id, wellhub_class_id, metadata')
          .eq('booking_number', bookingNumber)
          .single()

        if (booking) {
          await supabase.from('wellhub_bookings')
            .update({ estatus: 'Cancelado' })
            .eq('id', booking.id)

          const { data: clase } = await supabase
            .from('clases')
            .select('id, espacios_ocupados, capacidad_max')
            .eq('wellhub_slot_id', booking.wellhub_slot_id)
            .single()

          if (clase) {
            const nuevosOcupados = Math.max(0, (clase.espacios_ocupados || 0) - 1)

            await supabase.from('clases')
              .update({ espacios_ocupados: nuevosOcupados })
              .eq('id', clase.id)

            try {
              await actualizarCuposSlotWellhub(
                String(booking.wellhub_slot_id),
                nuevosOcupados,
                String(booking.wellhub_class_id || booking.metadata?.event_data?.slot?.class_id)
              )
            } catch (e: any) {
              console.error('Error actualizando cupos cancelación Wellhub:', e.message)
            }

            await supabase.from('reservas')
              .update({ estatus: 'Cancelada' })
              .eq('clase_id', clase.id)
              .eq('cliente_id', booking.cliente_id)
          }

          if (body.event_type === 'booking-late-cancelation') {
            await supabase.from('alertas').insert({
              tipo:        'no_show',
              categoria:   'asistencia',
              titulo:      `Cancelación tardía — Wellhub`,
              descripcion: `Booking ${bookingNumber} cancelado fuera de la ventana permitida`,
              cliente_id:  booking.cliente_id,
              metadata:    { booking_number: bookingNumber },
            })
          }
        }
      }

      return NextResponse.json({ received: true })
    }

    return NextResponse.json({ received: true })

  } catch (err: any) {
    console.error('Error procesando webhook Wellhub:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}