import { NextRequest, NextResponse } from 'next/server'

const WELLHUB_BASE_URL = 'https://apitesting.partners.gympass.com'

export async function POST(req: NextRequest) {
  const { slotId, totalCapacity, totalBooked } = await req.json()

  const body: any = {}
  if (totalCapacity !== undefined) body.total_capacity = totalCapacity
  if (totalBooked   !== undefined) body.total_booked   = totalBooked

  const res = await fetch(
    `${WELLHUB_BASE_URL}/booking/v1/gyms/${process.env.WELLHUB_GYM_ID}/slots/${slotId}`,
    {
      method:  'PATCH',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.WELLHUB_API_KEY}`,
      },
      body: JSON.stringify(body),
    }
  )
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = { raw: text } }
  return NextResponse.json({ status: res.status, data })
}