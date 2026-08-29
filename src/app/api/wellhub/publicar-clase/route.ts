import { NextRequest, NextResponse } from 'next/server'
import { supabase }                  from '@/lib/supabase'
import { crearClaseWellhub, crearSlotWellhub } from '@/lib/wellhub'

export async function POST(req: NextRequest) {
  try {
    const { claseId, nombre, descripcion, horario, duracionMinutos, capacidadMax } = await req.json()

    // 1. Crear la clase en Wellhub
    const claseData = await crearClaseWellhub(nombre, descripcion || nombre, 869)
    const wellhubClassId = claseData.classes[0].id

    // 2. Crear el slot
    const slotData = await crearSlotWellhub(String(wellhubClassId), {
      fechaInicio: horario,
      duracionMin: duracionMinutos,
      capacidad:   capacidadMax,
      productId:   869,
    })
    const wellhubSlotId = slotData.results[0].id

    // 3. Guardar referencias en Supabase
    await supabase.from('clases').update({
      wellhub_class_id: String(wellhubClassId),
      wellhub_slot_id:  String(wellhubSlotId),
    }).eq('id', claseId)

    return NextResponse.json({
      success:          true,
      wellhub_class_id: wellhubClassId,
      wellhub_slot_id:  wellhubSlotId,
    })

  } catch (err: any) {
    console.error('Error publicando en Wellhub:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}