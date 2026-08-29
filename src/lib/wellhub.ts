const WELLHUB_BASE_URL = 'https://apitesting.partners.gympass.com'

function wellhubHeaders() {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${process.env.WELLHUB_API_KEY}`,
  }
}

export async function validarAccesoWellhub(gympassId: string) {
  const res = await fetch(`${WELLHUB_BASE_URL}/access/v1/validate`, {
    method:  'POST',
    headers: { ...wellhubHeaders(), 'X-Gym-Id': process.env.WELLHUB_GYM_ID! },
    body:    JSON.stringify({ gympass_id: gympassId }),
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function crearClaseWellhub(nombre: string, descripcion: string, productId: number) {
  const url = `${WELLHUB_BASE_URL}/booking/v1/gyms/${process.env.WELLHUB_GYM_ID}/classes`
  const res = await fetch(url, {
    method:  'POST',
    headers: wellhubHeaders(),
    body: JSON.stringify({
      classes: [{
        name:        nombre,
        description: descripcion,
        notes:       descripcion,
        bookable:    true,
        visible:     true,
        is_virtual:  false,
        product_id:  productId,
      }],
    }),
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}: ${text}`)
  return data
}

export async function crearSlotWellhub(classId: string, params: {
  fechaInicio: string
  duracionMin: number
  capacidad:   number
  productId:   number
  room?:       string
}) {
  const url = `${WELLHUB_BASE_URL}/booking/v1/gyms/${process.env.WELLHUB_GYM_ID}/classes/${classId}/slots`
  const opensAt  = new Date(Date.now()).toISOString()
  const closesAt = params.fechaInicio

  const res = await fetch(url, {
    method:  'POST',
    headers: wellhubHeaders(),
    body: JSON.stringify({
      occur_date:       params.fechaInicio,
      status:           1,
      room:             params.room || 'Sala Principal',
      length_in_minutes:params.duracionMin,
      total_capacity:   params.capacidad,
      total_booked:     0,
      product_id:       params.productId,
      booking_window:   { opens_at: opensAt, closes_at: closesAt },
      cancellable_until: closesAt,
      instructors:      [],
      rate:             0,
    }),
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}: ${text}`)
  return data
}

export async function crearBookingWellhub(gympassUserId: string, slotId: number, classId: number) {
  const url = `${WELLHUB_BASE_URL}/helper/v1/gyms/${process.env.WELLHUB_GYM_ID}/simulate/bookings`
  const res = await fetch(url, {
    method:  'POST',
    headers: { ...wellhubHeaders(), Accept: 'application/json' },
    body: JSON.stringify({
      gympass_user_id: gympassUserId,
      slot_id:         slotId,
      class_id:        classId,
    }),
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}: ${text}`)
  return data
}

export async function simularCheckinConBooking(gympassUserId: string, productId: number, bookingNumber: string) {
  const url = `${WELLHUB_BASE_URL}/helper/v1/gyms/${process.env.WELLHUB_GYM_ID}/simulate/checkins`
  const res = await fetch(url, {
    method:  'POST',
    headers: wellhubHeaders(),
    body: JSON.stringify({
      gympass_user_id: gympassUserId,
      product_id:      productId,
      booking_number:  bookingNumber,
    }),
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}: ${text}`)
  return data
}

export async function confirmarBookingWellhub(bookingNumber: string, classId: number, confirmar: boolean) {
  const url = `${WELLHUB_BASE_URL}/booking/v1/gyms/${process.env.WELLHUB_GYM_ID}/bookings/${bookingNumber}`
  const res = await fetch(url, {
    method:  'PATCH',
    headers: wellhubHeaders(),
    body: JSON.stringify({
      class_id: classId,
      status:   confirmar ? 2 : 3, // 2 = Reserved (confirmado) | 3 = Rejected
    }),
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}: ${text}`)
  return data
}

export async function actualizarCapacidadSlotWellhub(slotId: string, totalCapacity: number) {
  const url = `${WELLHUB_BASE_URL}/booking/v1/gyms/${process.env.WELLHUB_GYM_ID}/slots/${slotId}`
  const res = await fetch(url, {
    method:  'PATCH',
    headers: wellhubHeaders(),
    body: JSON.stringify({
      total_capacity: totalCapacity,
    }),
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}: ${text}`)
  return data
}

export async function actualizarCuposSlotWellhub(slotId: string, totalBooked: number, classId: string) {
  const url = `${WELLHUB_BASE_URL}/booking/v1/gyms/${process.env.WELLHUB_GYM_ID}/classes/${classId}/slots/${slotId}`
  const res = await fetch(url, {
    method:  'PATCH',
    headers: wellhubHeaders(),
    body: JSON.stringify({ total_booked: totalBooked }),
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}: ${text}`)
  return data
}