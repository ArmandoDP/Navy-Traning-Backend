// /app/api/demo-wellhub/route.ts
import { NextResponse }        from 'next/server'
import { crearBookingWellhub } from '@/lib/wellhub'

export async function GET() {
  try {
    const bookingData = await crearBookingWellhub('1000000000007', 283844, 14285)

    const res = await fetch('http://localhost:3000/api/webhooks/wellhub', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(bookingData),
    })

    const webhookResponse = await res.json()

    return NextResponse.json({
      "✅ 1. Booking creado en Wellhub": bookingData,
      "✅ 2. Webhook procesado":          webhookResponse,
      "✅ 3. Resumen": {
        usuario:        bookingData.event_data.user.name,
        booking_number: bookingData.event_data.slot.booking_number,
        clase:          'Dibujando monas chinas',
        slot_id:        bookingData.event_data.slot.id,
        estatus:        'Confirmado automáticamente',
        origen:         'Wellhub'
      }
    }, { status: 200 })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}