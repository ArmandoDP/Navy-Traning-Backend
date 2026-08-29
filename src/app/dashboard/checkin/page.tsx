'use client'
import { useState, useEffect } from 'react'
import { supabase }            from '@/lib/supabase'
import { useSucursal }         from '@/context/SucursalContext'
import CheckinLayout           from '@/components/checkin/CheckinLayout'

export default function CheckinPage() {
  const { sucursalId, sucursalActiva } = useSucursal()
  const [checkins, setCheckins]        = useState<any[]>([])
  const [loading,  setLoading]         = useState(true)

  const fetchCheckins = async () => {
    let q = supabase
      .from('asistencias')
      .select(`
        *,
        clientes(nombre_completo, es_invitado),
        clases(nombre_clase, horario, duracion_minutos, tipo_clase),
        sucursales(nombre, color)
      `)
      .order('fecha_checkin', { ascending: false })
      .limit(50)

    if (sucursalId) q = q.eq('sucursal_id', sucursalId)

    const { data } = await q
    if (data) setCheckins(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchCheckins()

    // Realtime
    const channel = supabase.channel('checkins-realtime')
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'asistencias',
      }, () => fetchCheckins())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sucursalId])

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Check-in</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Escanea el QR del cliente para registrar su asistencia
            {sucursalActiva && ` · ${sucursalActiva.nombre}`}
          </p>
        </div>
      </div>

      <CheckinLayout
        sucursalId={sucursalId}
        sucursalNombre={sucursalActiva?.nombre || 'Global'}
        checkins={checkins}
        loading={loading}
        onCheckin={fetchCheckins}
      />
    </div>
  )
}