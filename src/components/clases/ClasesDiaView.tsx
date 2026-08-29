'use client'
import Link from 'next/link'

interface Clase {
  id: string; nombre_clase: string; tipo_clase: string; tipo_display: string
  color: string; horario: string; capacidad_max: number; salon: string
  estado: string; duracion_minutos: number
  staff?: { nombre: string; primer_apellido: string }
  reservas?: any[]
}

interface Props {
  clases:      Clase[]
  fechaActiva: Date
}

const TIPO_COLORS: Record<string, string> = {
  Hybrid: '#3b82f6', Hyrox: '#22c55e', Spinning: '#f97316',
  Yoga: '#8b5cf6', Box: '#ef4444', Funcional: '#6366f1', General: '#9ca3af',
}

const HORAS = Array.from({ length: 18 }, (_, i) => i + 5) // 05:00 - 22:00

export default function ClasesDiaView({ clases, fechaActiva }: Props) {
  const clasesDia = clases.filter(c => new Date(c.horario).toDateString() === fechaActiva.toDateString())

  const getClasesPorHora = (hora: number) =>
    clasesDia.filter(c => new Date(c.horario).getHours() === hora)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="divide-y divide-gray-50">
        {HORAS.map(hora => {
          const clasesHora = getClasesPorHora(hora)
          return (
            <div key={hora} className={`flex gap-4 px-5 py-3 min-h-[56px] ${clasesHora.length === 0 ? 'hover:bg-gray-50' : ''}`}>
              {/* Hora */}
              <div className="w-12 flex-shrink-0 pt-1">
                <span className="text-xs font-bold text-gray-400">
                  {String(hora).padStart(2, '0')}:00
                </span>
              </div>

              {/* Clases */}
              <div className="flex-1 flex flex-wrap gap-2">
                {clasesHora.map(c => {
                  const tipo  = c.tipo_display || c.tipo_clase || 'General'
                  const color = c.color && c.color !== '#6366f1' ? c.color : (TIPO_COLORS[tipo] || TIPO_COLORS['General'])
                  const min   = new Date(c.horario).getMinutes()
                  const reservas = c.reservas?.filter((r: any) => r.estatus !== 'Cancelada').length || 0
                  const duracion = c.duracion_minutos || 60

                  return (
                    <Link key={c.id} href={`/dashboard/clases/${c.id}`}
                      className="flex flex-col justify-between p-3 rounded-xl border-l-4 shadow-sm hover:shadow-md transition min-w-[180px] flex-1 max-w-[240px]"
                      style={{ borderLeftColor: color, backgroundColor: `${color}10` }}>
                      <div>
                        <p className="text-sm font-black text-gray-900">{c.nombre_clase}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {String(hora).padStart(2,'0')}:{String(min).padStart(2,'0')} · {duracion} min
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[11px] text-gray-500">{c.staff ? `${c.staff.nombre} ${c.staff.primer_apellido}`.trim() : '—'}</span>
                        <span className="text-[11px] font-bold" style={{ color }}>{reservas}/{c.capacidad_max}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}