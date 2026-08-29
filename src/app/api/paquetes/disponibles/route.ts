import { NextRequest, NextResponse } from 'next/server'
import { supabase }                  from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sucursalId = searchParams.get('sucursal_id')
  if (!sucursalId) return NextResponse.json({ error: 'sucursal_id requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('paquetes')
    .select('*, codigo_interno, paquete_precios(precio_app, activo, sucursal_id), paquete_rooms(rooms(nombre))')
    .eq('estatus', 'Activo')
    .eq('paquete_precios.sucursal_id', sucursalId)
    .eq('paquete_precios.activo', true)
    .eq('visible_en_app', true)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const paquetes = data?.filter(p => p.paquete_precios?.length > 0).map(p => ({
    id:               p.id,
    nombre:           p.nombre,
    clases_incluidas: p.clases_incluidas,
    vigencia_dias:    p.vigencia_dias,
    renovacion:       p.renovacion,
    codigo_interno:   p.codigo_interno,
    bio:              p.bio || null,  // ← agrega esto
    precio:           p.paquete_precios[0]?.precio_app || 0,
    rooms:            p.paquete_rooms?.map((pr: any) => pr.rooms?.nombre).filter(Boolean) || [],
    max_usuarios: p.max_usuarios || 1, 
  }))

  return NextResponse.json({ paquetes })
}