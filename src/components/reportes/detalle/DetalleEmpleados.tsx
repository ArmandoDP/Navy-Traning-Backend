'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  empleados:  any[]
  periodoId:  string
  onRefresh:  () => void
}

const NIVEL_COLORS: Record<string, string> = {
  'Lead':        '#9ca3af',
  'Junior':      '#9ca3af',
  'Marine':      '#06b6d4',
  'Semi-senior': '#3b82f6',
  'Senior':      '#22c55e',
  'Elite':       '#f59e0b',
}

const TIPO_COLORS: Record<string, string> = {
  'Coach':         '#6366f1',
  'Manager':       '#10b981',
  'Submanager':    '#14b8a6',
  'Regional':      '#8b5cf6',
  'Front':         '#ec4899',
  'Staff general': '#6b7280',
  'Limpieza':      '#f97316',
  'Mantto':        '#f59e0b',
}

function hexSoftBg(hex: string) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},0.12)`
}

const POR_PAGINA = 10

export default function DetalleEmpleados({ empleados, periodoId, onRefresh }: Props) {
  const [pagina,   setPagina]   = useState(1)
  const [loading,  setLoading]  = useState<string | null>(null)

  const totalPags = Math.max(Math.ceil(empleados.length / POR_PAGINA), 1)
  const paginados = empleados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  const handleToggleEstatus = async (nominaId: string, estatusActual: string) => {
    setLoading(nominaId)
    const nuevoEstatus = estatusActual === 'Aprobado' ? 'Pendiente' : 'Aprobado'
    await supabase.from('nomina_empleados')
      .update({
        estatus:      nuevoEstatus,
        aprobado_at:  nuevoEstatus === 'Aprobado' ? new Date().toISOString() : null,
      })
      .eq('id', nominaId)
    onRefresh()
    setLoading(null)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <p className="text-sm font-black text-gray-900">
          Desglose por empleado
          <span className="text-gray-400 font-normal ml-1 text-xs">
            ({empleados.length} empleados ordenados por nómina)
          </span>
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-gray-400 text-[11px] font-bold uppercase border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="px-5 py-3">Empleado</th>
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Nivel</th>
              <th className="px-5 py-3">Clases</th>
              <th className="px-5 py-3">Horas</th>
              <th className="px-5 py-3">Pago base</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paginados.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-gray-400 italic text-sm">
                  Sin empleados en este período
                </td>
              </tr>
            ) : paginados.map(e => {
              const tipoColor  = TIPO_COLORS[e.staff?.tipo] || '#6b7280'
              const nivelColor = NIVEL_COLORS[e.staff?.nivel] || '#9ca3af'
              const aprobado   = e.estatus === 'Aprobado'

              return (
                <tr key={e.id} className="hover:bg-gray-50 transition">

                  {/* Empleado */}
                  <td className="px-5 py-3 min-w-[180px]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-black text-gray-500 flex-shrink-0">
                        {e.staff?.nombre?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {e.staff?.nombre} {e.staff?.primer_apellido}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Tipo */}
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold"
                      style={{ color: tipoColor, backgroundColor: hexSoftBg(tipoColor) }}>
                      {e.staff?.tipo}
                    </span>
                  </td>

                  {/* Nivel */}
                  <td className="px-5 py-3">
                    {e.staff?.nivel
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: nivelColor }} />
                          {e.staff.nivel}
                        </span>
                      : <span className="text-xs text-gray-300">—</span>
                    }
                  </td>

                  {/* Clases */}
                  <td className="px-5 py-3 text-sm text-gray-700">
                    {e.clases_count ?? '—'}
                  </td>

                  {/* Horas */}
                  <td className="px-5 py-3 text-sm text-gray-700">
                    {e.horas > 0 ? `${e.horas}h` : '—'}
                  </td>

                  {/* Pago base */}
                  <td className="px-5 py-3 text-sm text-gray-700">
                    ${e.pago_base.toLocaleString()}
                  </td>

                  {/* Total */}
                  <td className="px-5 py-3 text-sm font-black text-gray-900">
                    ${e.total.toLocaleString()}
                  </td>

                  {/* Estado */}
                  <td className="px-5 py-3">
                    <button
                      onClick={() => handleToggleEstatus(e.id, e.estatus)}
                      disabled={loading === e.id}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold transition ${
                        aprobado
                          ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                          : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                      }`}>
                      {loading === e.id ? '...' : aprobado ? 'Aprobado' : 'Pendiente'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
        <div className="flex gap-1">
          {Array.from({ length: Math.min(totalPags, 5) }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => setPagina(n)}
              className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                pagina === n ? 'bg-gray-900 text-white' : 'hover:bg-gray-100 text-gray-500'
              }`}>
              {n}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Resultados por página <span className="font-bold text-gray-600">{POR_PAGINA}</span>
        </p>
      </div>
    </div>
  )
}