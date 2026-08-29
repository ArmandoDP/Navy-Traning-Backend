'use client'
import { useEffect, useState } from 'react'
import { supabase }            from '@/lib/supabase'
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'

interface Props { empleado: any }

export default function StaffTabMetricas({ empleado }: Props) {
  const [clases,      setClases]      = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [agrupacion,  setAgrupacion]  = useState<'mes' | 'semana'>('mes')

  const isCoach = empleado?.tipo === 'Coach'

  useEffect(() => {
    if (!isCoach) { setLoading(false); return }
    const desde = new Date()
    desde.setMonth(desde.getMonth() - 6)
    supabase.from('clases')
      .select('id, horario, capacidad_max, reservas(id), asistencias(id)')
      .eq('coach_id', empleado.id)
      .gte('horario', desde.toISOString())
      .order('horario', { ascending: true })
      .then(({ data }) => { if (data) setClases(data); setLoading(false) })
  }, [empleado.id, isCoach])

  // Agrupar para gráfica
  const porPeriodo = clases.reduce((acc: Record<string, number>, c) => {
    const fecha = new Date(c.horario.replace('+00:00', 'Z'))
    const key = agrupacion === 'mes'
      ? fecha.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })
      : `S${Math.ceil(fecha.getDate() / 7)} ${fecha.toLocaleDateString('es-MX', { month: 'short' })}`
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const graficaData  = Object.entries(porPeriodo).map(([periodo, total]) => ({ periodo, total }))
  const maxVal       = Math.max(...graficaData.map(d => d.total), 1)

  // KPIs
  const totalClases   = clases.length
  const ingresos      = totalClases * 2 * (empleado.tarifa_hora || 0)
  const ocupacionProm = clases.length > 0
    ? Math.round(clases.reduce((acc, c) => {
        const reservas  = c.reservas?.length || 0
        const capacidad = c.capacidad_max || 0
        return acc + (capacidad > 0 ? (reservas / capacidad) * 100 : 0)
      }, 0) / clases.length)
    : 0

  return (
    <div className="px-6 py-5 space-y-6">

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        {isCoach ? (
          <>
            <div className="bg-gray-50 rounded-2xl px-4 py-4">
              <p className="text-xs text-gray-400 font-medium">Ingresos generados</p>
              <p className="text-xl font-black text-gray-900 mt-1">${ingresos.toLocaleString()}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {totalClases * 2}H × ${empleado.tarifa_hora || 0}/H
              </p>
            </div>
            <div className="bg-gray-50 rounded-2xl px-4 py-4">
              <p className="text-xs text-gray-400 font-medium">Clases impartidas</p>
              <p className="text-xl font-black text-gray-900 mt-1">{totalClases}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Últimos 6 meses</p>
            </div>
            <div className="bg-gray-50 rounded-2xl px-4 py-4">
              <p className="text-xs text-gray-400 font-medium">Ocupación promedio</p>
              <p className="text-xl font-black mt-1"
                style={{ color: ocupacionProm >= 80 ? '#22c55e' : ocupacionProm >= 60 ? '#f59e0b' : '#ef4444' }}>
                {ocupacionProm}%
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">Promedio de reservas</p>
            </div>
            <div className="bg-gray-50 rounded-2xl px-4 py-4">
              <p className="text-xs text-gray-400 font-medium">Tarifa por hora</p>
              <p className="text-xl font-black text-gray-900 mt-1">
                ${(empleado.tarifa_hora || 0).toLocaleString()}/h
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">{empleado.nivel || 'Sin nivel'}</p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-gray-50 rounded-2xl px-4 py-4">
              <p className="text-xs text-gray-400 font-medium">Nómina del período</p>
              <p className="text-xl font-black text-gray-900 mt-1">
                ${(empleado.sueldo_fijo || 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">{empleado.tipo_pago || 'Fijo'}</p>
            </div>
            <div className="bg-gray-50 rounded-2xl px-4 py-4">
              <p className="text-xs text-gray-400 font-medium">Horas trabajadas</p>
              <p className="text-xl font-black text-gray-900 mt-1">—</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Pendiente check-in</p>
            </div>
          </>
        )}
      </div>

      {/* Gráfica solo coaches */}
      {isCoach && (
        <div>
          {/* Header gráfica */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Tendencia</p>
              <p className="text-xs text-gray-500">
                Clases impartidas por {agrupacion === 'mes' ? 'mes' : 'semana'}
              </p>
            </div>
            <div className="flex gap-1">
              {(['mes', 'semana'] as const).map(a => (
                <button key={a} onClick={() => setAgrupacion(a)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    agrupacion === a
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {a === 'mes' ? '6 meses' : 'Semanas'}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="h-36 flex items-center justify-center text-gray-300 text-sm">
              Cargando...
            </div>
          ) : graficaData.length === 0 ? (
            <div className="h-36 flex items-center justify-center text-gray-300 text-sm italic">
              Sin datos
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={graficaData} barSize={agrupacion === 'mes' ? 32 : 18} barCategoryGap="20%">
                <XAxis
                  dataKey="periodo"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 10,
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontSize: 12,
                    padding: '6px 12px',
                  }}
                  formatter={(v: any) => [`${v} clases`, '']}
                  labelStyle={{ fontWeight: 'bold', color: '#374151' }}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {graficaData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.total === maxVal ? '#4f46e5' : '#e0e7ff'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  )
}