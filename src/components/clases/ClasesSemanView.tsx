'use client'
import Link from 'next/link'

interface Clase {
  id: string; nombre_clase: string; tipo_clase: string; tipo_display: string
  color: string; horario: string; capacidad_max: number
  staff?: { nombre: string; primer_apellido: string }
  reservas?: any[]
}

interface Props {
  clases:      Clase[]
  fechaActiva: Date
}

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const HORAS       = Array.from({ length: 18 }, (_, i) => i + 5)

const TIPO_COLORS: Record<string, string> = {
  Hybrid: '#3b82f6', Hyrox: '#22c55e', Spinning: '#f97316',
  Yoga: '#8b5cf6', Box: '#ef4444', Funcional: '#6366f1', General: '#9ca3af',
}

function getInicioSemana(fecha: Date) {
  const d    = new Date(fecha)
  const day  = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export default function ClasesSemanView({ clases, fechaActiva }: Props) {
  const inicioSemana = getInicioSemana(fechaActiva)
  const diasSemana   = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicioSemana)
    d.setDate(d.getDate() + i)
    return d
  })

  const hoy = new Date()

  const getClases = (dia: Date, hora: number) =>
    clases.filter(c => {
      const f = new Date(c.horario)
      return f.toDateString() === dia.toDateString() && f.getHours() === hora
    })

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden overflow-x-auto">
      <table className="w-full min-w-[800px]">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="w-14 px-3 py-3" />
            {diasSemana.map((d, i) => {
              const esHoy = d.toDateString() === hoy.toDateString()
              return (
                <th key={i} className="px-2 py-3 text-center">
                  <p className="text-xs text-gray-400 font-medium">{DIAS_SEMANA[i]}</p>
                  <span className={`text-sm font-black inline-flex items-center justify-center w-7 h-7 rounded-full mt-0.5 ${
                    esHoy ? 'bg-indigo-600 text-white' : 'text-gray-700'
                  }`}>
                    {d.getDate()}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {HORAS.map(hora => (
            <tr key={hora} className="border-b border-gray-50">
              <td className="px-3 py-2 text-xs text-gray-400 font-bold align-top pt-2">
                {String(hora).padStart(2,'0')}:00
              </td>
              {diasSemana.map((dia, i) => {
                const clasesSlot = getClases(dia, hora)
                return (
                  <td key={i} className="px-1 py-1 min-h-[48px] align-top">
                    <div className="space-y-1">
                      {clasesSlot.map(c => {
                        const tipo  = c.tipo_display || c.tipo_clase || 'General'
                        const color = c.color && c.color !== '#6366f1' ? c.color : (TIPO_COLORS[tipo] || TIPO_COLORS['General'])
                        return (
                          <Link key={c.id} href={`/dashboard/clases/${c.id}`}
                            className="block px-2 py-1 rounded-lg text-[11px] font-bold truncate hover:opacity-80 transition"
                            style={{ backgroundColor: `${color}18`, color, borderLeft: `3px solid ${color}` }}>
                            {new Date(c.horario).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', hour12: false })} {c.nombre_clase}
                          </Link>
                        )
                      })}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}