'use client'
import { useEffect, useState } from 'react'
import { supabase }            from '@/lib/supabase'

interface Props { empleado: any }

export default function StaffTabNomina({ empleado }: Props) {
  const [clases,   setClases]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [periodo,  setPeriodo]  = useState(() => {
    const hoy = new Date()
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  })

  const isCoach = empleado?.tipo === 'Coach'

  useEffect(() => {
    if (!isCoach) { setLoading(false); return }
    const [año, mes] = periodo.split('-')
    const desde = new Date(Number(año), Number(mes) - 1, 1).toISOString()
    const hasta  = new Date(Number(año), Number(mes), 0, 23, 59, 59).toISOString()

    setLoading(true)
    supabase.from('clases')
      .select('*, sucursales(nombre, color), asistencias(id), staff_reglas_bono(*)')
      .eq('coach_id', empleado.id)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
      .then(({ data }) => { if (data) setClases(data); setLoading(false) })
  }, [periodo, empleado.id, isCoach])

  // Calcular bono por reglas
  const calcBono = (clase: any) => {
    const reglas = empleado.staff_reglas_bono || []
    const asistentes = clase.asistencias?.length || 0
    let bono = 0
    for (const regla of reglas) {
      if (
        regla.categoria === (clase.nombre || clase.tipo) &&
        regla.niveles?.includes(empleado.nivel) &&
        asistentes >= regla.min_asistentes
      ) {
        bono += regla.monto_bono
      }
    }
    return bono
  }

  const tarifa      = empleado.tarifa_hora || 0
  const horasPorClase = 2 // asumimos 2h por clase — ajustable
  const clasesConBono = clases.map(c => ({ ...c, bono: calcBono(c) }))
  const pagoBase    = clases.length * horasPorClase * tarifa
  const totalBonos  = clasesConBono.reduce((acc, c) => acc + c.bono, 0)
  const ajustes     = empleado.adeudo || 0
  const totalPagar  = pagoBase + totalBonos - ajustes

  const mesLabel = new Date(periodo + '-01').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

  return (
    <div className="px-6 py-5 space-y-5">

      {/* Selector período */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Período</span>
          <input type="month" value={periodo}
            onChange={e => setPeriodo(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-50 outline-none focus:border-gray-400" />
        </div>
        <button className="text-xs font-bold text-indigo-500 hover:text-indigo-700 transition">
          Exportar PDF ↗
        </button>
      </div>

      {/* Resumen */}
      {isCoach ? (
        <>
          <div className="bg-gray-50 rounded-2xl px-5 py-4 space-y-3">
            <p className="text-xs font-black text-gray-400 uppercase">Cálculo del período en curso</p>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Pago base (horas)</p>
                <p className="text-lg font-black text-gray-900">${pagoBase.toLocaleString()}</p>
                <p className="text-[11px] text-gray-400">{clases.length * horasPorClase}h × ${tarifa}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Bonos por asistencia</p>
                <p className="text-lg font-black text-emerald-500">+${totalBonos.toLocaleString()}</p>
                <p className="text-[11px] text-gray-400">{clasesConBono.filter(c => c.bono > 0).length} clases con bono</p>
              </div>
            </div>

            {ajustes > 0 && (
              <div className="flex items-center justify-between border-t border-gray-200 pt-2">
                <p className="text-xs text-gray-500">Ajustes</p>
                <p className="text-sm font-bold text-red-400">-${ajustes.toLocaleString()}</p>
              </div>
            )}

            <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
              <p className="text-sm font-black text-gray-700">Total a pagar</p>
              <div className="bg-gray-900 text-white rounded-xl px-4 py-2 text-right">
                <p className="text-lg font-black">${totalPagar.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400">{mesLabel}</p>
              </div>
            </div>
          </div>

          {/* Detalle clase por clase */}
          <div>
            <p className="text-xs font-black text-gray-400 uppercase mb-3">Detalle clase por clase</p>
            {loading ? (
              <div className="text-center text-gray-300 text-sm py-8">Cargando...</div>
            ) : clases.length === 0 ? (
              <div className="text-center text-gray-300 text-sm italic py-8">Sin clases en este período</div>
            ) : (
              <>
                {/* Header */}
                <div className="grid grid-cols-6 gap-2 px-3 py-2 text-[10px] font-bold text-gray-400 uppercase">
                  <span className="col-span-1">Fecha</span>
                  <span className="col-span-1">Hora</span>
                  <span className="col-span-1">Clase</span>
                  <span className="col-span-1">Asist</span>
                  <span className="col-span-1">Pago</span>
                  <span className="col-span-1">Bono</span>
                </div>
                <div className="space-y-1">
                  {clasesConBono.map(c => {
                    const fecha = new Date(c.fecha)
                    const color = c.sucursales?.color || '#6b7280'
                    const r = parseInt(color.slice(1,3),16)
                    const g = parseInt(color.slice(3,5),16)
                    const b = parseInt(color.slice(5,7),16)
                    return (
                      <div key={c.id}
                        className="grid grid-cols-6 gap-2 px-3 py-2 bg-gray-50 rounded-xl items-center text-xs">
                        <span className="text-gray-500 col-span-1">
                          {fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                        </span>
                        <span className="text-gray-500 col-span-1">
                          {fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="col-span-1">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ color, backgroundColor: `rgba(${r},${g},${b},0.12)` }}>
                            {c.nombre || c.tipo}
                          </span>
                        </span>
                        <span className="text-gray-700 font-bold col-span-1">
                          {c.asistencias?.length || 0}
                        </span>
                        <span className="text-gray-700 font-bold col-span-1">
                          ${(horasPorClase * tarifa).toLocaleString()}
                        </span>
                        <span className={`font-bold col-span-1 ${c.bono > 0 ? 'text-emerald-500' : 'text-gray-300'}`}>
                          {c.bono > 0 ? `+$${c.bono}` : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mt-3 text-center">
                  +{clases.length} clases en el período · Avg {clases.length > 0 ? Math.round(clases.reduce((a,c) => a + (c.asistencias?.length||0), 0)/clases.length) : 0} asist.
                </p>
              </>
            )}
          </div>
        </>
      ) : (
        /* No coach — nómina simple */
        <div className="bg-gray-50 rounded-2xl px-5 py-4 space-y-3">
          <p className="text-xs font-black text-gray-400 uppercase">Cálculo del período</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Sueldo fijo</p>
              <p className="text-2xl font-black text-gray-900">
                ${(empleado.sueldo_fijo || 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-gray-400">{empleado.tipo_pago || 'Fijo'}</p>
            </div>
            {ajustes > 0 && (
              <div className="text-right">
                <p className="text-xs text-gray-500">Adeudo</p>
                <p className="text-sm font-bold text-red-400">-${ajustes.toLocaleString()}</p>
              </div>
            )}
          </div>
          <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
            <p className="text-sm font-black text-gray-700">Total a pagar</p>
            <div className="bg-gray-900 text-white rounded-xl px-4 py-2">
              <p className="text-lg font-black">
                ${((empleado.sueldo_fijo || 0) - ajustes).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}