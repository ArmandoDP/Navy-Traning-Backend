'use client'
import { useEffect, useState } from 'react'
import { supabase }            from '@/lib/supabase'

interface Props { empleado: any }

export default function StaffTabPerformance({ empleado }: Props) {
  const [clases,  setClases]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const desde = new Date()
    desde.setDate(desde.getDate() - 30)
    supabase.from('clases')
      .select('*, sucursales(nombre, color), reservas(id), asistencias(id)')
      .eq('coach_id', empleado.id)
      .gte('fecha', desde.toISOString())
      .order('fecha', { ascending: false })
      .then(({ data }) => { if (data) setClases(data); setLoading(false) })
  }, [empleado.id])

  const totalClases  = clases.length
  const asistProm    = clases.length > 0
    ? Math.round(clases.reduce((acc, c) => {
        const spots = c.reservas?.length || 0
        const asist = c.asistencias?.length || 0
        return acc + (spots > 0 ? (asist / spots) * 100 : 0)
      }, 0) / clases.length)
    : 0
  const ocupProm     = asistProm

  // Top 5 clases por ocupación
  const topClases = [...clases]
    .map(c => ({
      ...c,
      ocp: c.reservas?.length > 0
        ? Math.round((c.asistencias?.length / c.reservas?.length) * 100)
        : 0
    }))
    .sort((a, b) => b.ocp - a.ocp)
    .slice(0, 5)

  if (loading) return (
    <div className="flex items-center justify-center h-32 text-gray-300 text-sm px-6 py-5">
      Cargando...
    </div>
  )

  return (
    <div className="px-6 py-5 space-y-6">

      {/* KPIs */}
      <div>
        <p className="text-xs font-black text-gray-400 uppercase mb-3">
          Indicadores clase · Últimos 30 días
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-2xl px-4 py-3">
            <p className="text-xs text-gray-400">Clases impartidas</p>
            <p className="text-xl font-black text-gray-900 mt-1">{totalClases}</p>
            <p className="text-[11px] text-emerald-500 mt-0.5">↑ vs el mes anterior</p>
          </div>
          <div className="bg-gray-50 rounded-2xl px-4 py-3">
            <p className="text-xs text-gray-400">Asistencia promedio</p>
            <p className="text-xl font-black mt-1"
              style={{ color: asistProm >= 80 ? '#22c55e' : asistProm >= 60 ? '#f59e0b' : '#ef4444' }}>
              {asistProm}%
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">De espacios reservados y asistidos</p>
          </div>
          <div className="bg-gray-50 rounded-2xl px-4 py-3">
            <p className="text-xs text-gray-400">Ocupación de clases</p>
            <p className="text-xl font-black mt-1"
              style={{ color: ocupProm >= 80 ? '#22c55e' : ocupProm >= 60 ? '#f59e0b' : '#ef4444' }}>
              {ocupProm}%
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">Promedio ponderado</p>
          </div>
        </div>
      </div>

      {/* Top clases */}
      <div>
        <p className="text-xs font-black text-gray-400 uppercase mb-3">
          Clases con mejor ocupación · Últimos 30 días
        </p>
        <div className="space-y-2">
          {topClases.length === 0 ? (
            <p className="text-sm text-gray-300 italic text-center py-4">Sin datos</p>
          ) : topClases.map((c, i) => {
            const color = c.sucursales?.color || '#6b7280'
            const r = parseInt(color.slice(1,3),16)
            const g = parseInt(color.slice(3,5),16)
            const b = parseInt(color.slice(5,7),16)
            const fecha = new Date(c.fecha)

            return (
              <div key={c.id}
                className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
                <span className="text-sm font-black text-gray-300 w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-gray-800">{c.nombre || c.tipo}</p>
                    <span className="text-[10px] text-gray-400">
                      {fecha.toLocaleDateString('es-MX', { weekday: 'short' })} ·{' '}
                      {fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block"
                    style={{ color, backgroundColor: `rgba(${r},${g},${b},0.12)` }}>
                    {c.sucursales?.nombre}
                  </span>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full"
                        style={{
                          width: `${c.ocp}%`,
                          backgroundColor: c.ocp >= 80 ? '#22c55e' : c.ocp >= 60 ? '#f59e0b' : '#ef4444'
                        }} />
                    </div>
                    <span className={`text-xs font-bold ${
                      c.ocp >= 80 ? 'text-emerald-500' : c.ocp >= 60 ? 'text-amber-500' : 'text-red-400'
                    }`}>{c.ocp}%</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {c.asistencias?.length || 0}/{c.reservas?.length || 0}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}