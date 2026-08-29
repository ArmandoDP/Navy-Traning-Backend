        'use client'
import { useState, useEffect } from 'react'
import { supabase }            from '@/lib/supabase'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props { empleado: any }

type Vista = 'proximas' | 'historial'

export default function StaffTabClases({ empleado }: Props) {
  const [vista,   setVista]   = useState<Vista>('proximas')
  const [clases,  setClases]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const hoy   = new Date()
    const desde = vista === 'proximas'
        ? new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString()
        : new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1).toISOString()
    const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 2, 0).toISOString()

    setLoading(true)
    supabase.from('clases')
        .select('id, nombre_clase, horario, tipo_clase, capacidad_max, sucursales(nombre, color), reservas(id), asistencias(id)')
        .eq('coach_id', empleado.id)
        .gte('horario', desde)
        .lte('horario', vista === 'historial' ? hasta : '2099-01-01')
        .order('horario', { ascending: vista === 'proximas' })
        .limit(50)
        .then(({ data }) => { if (data) setClases(data); setLoading(false) })
    }, [vista, empleado.id])

  const ocupacion = (c: any) => {
    const reservas   = c.reservas?.length || 0
    const capacidad  = c.capacidad_max || 0
    if (capacidad === 0) return null
    return Math.round((reservas / capacidad) * 100)
  }

  const formatFecha = (horario: string) => {
    if (!horario) return { dia: '—', mes: '—', hora: '—', dow: '—' }
    const d = new Date(horario.replace('+00:00', 'Z'))
    return {
        dia:  d.toLocaleDateString('es-MX', { day: '2-digit' }),
        mes:  d.toLocaleDateString('es-MX', { month: 'short' }).toUpperCase(),
        hora: d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        dow:  d.toLocaleDateString('es-MX', { weekday: 'short' }),
    }
    }

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="flex gap-1 px-6 pt-4 pb-3">
        {(['proximas', 'historial'] as Vista[]).map(v => (
          <button key={v} onClick={() => setVista(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              vista === v ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}>
            {v === 'proximas' ? 'Próximas' : 'Historial'}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-6 space-y-2 pb-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-300 text-sm">Cargando...</div>
        ) : clases.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-300 text-sm italic">
            Sin clases {vista === 'proximas' ? 'próximas' : 'en el historial'}
          </div>
        ) : clases.map(c => {
          const f = formatFecha(c.horario)
          const ocp = ocupacion(c)
          const color = c.sucursales?.color || '#6b7280'
          const r = parseInt(color.slice(1,3),16)
          const g = parseInt(color.slice(3,5),16)
          const b = parseInt(color.slice(5,7),16)

          return (
            <div key={c.id}
                className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl px-4 py-3 hover:bg-gray-50 transition shadow-sm">
                
                {/* Fecha */}
                <div className="text-center w-10 flex-shrink-0">
                <p className="text-lg font-black text-gray-900 leading-tight">{f.dia}</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase">{f.mes}</p>
                </div>

                {/* Borde color tipo */}
                <div className="w-1 h-10 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{c.nombre_clase || c.tipo_clase}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                    {f.dow} · {f.hora} · {c.sucursales?.nombre}
                </p>
                </div>

                {/* Ocupación */}
                {ocp !== null && (
                <div className="text-right flex-shrink-0 space-y-1">
                    <div className="flex items-center gap-2 justify-end">
                    <span className="text-[11px] text-gray-400">
                        {c.reservas?.length || 0}/{c.capacidad_max || 0}
                    </span>
                    <span className={`text-xs font-black ${
                        ocp >= 80 ? 'text-emerald-500' : ocp >= 50 ? 'text-amber-500' : 'text-red-400'
                    }`}>{ocp}%</span>
                    </div>
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                        style={{
                        width: `${ocp}%`,
                        backgroundColor: ocp >= 80 ? '#22c55e' : ocp >= 50 ? '#f59e0b' : '#ef4444'
                        }} />
                    </div>
                </div>
                )}
            </div>
            )
        })}
      </div>
    </div>
  )
}