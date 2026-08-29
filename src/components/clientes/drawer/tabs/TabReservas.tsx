'use client'
import { Check, ChevronRight, Clock } from 'lucide-react'

interface Props { reservas: any[] }

export default function TabReservas({ reservas }: Props) {
  const sorted = [...reservas].sort((a, b) =>
    new Date(b.clases?.horario || b.created_at).getTime() -
    new Date(a.clases?.horario || a.created_at).getTime()
  )

  const getEstadoUI = (r: any) => {
    const horario = r.clases?.horario
    const esProxima = horario && new Date(horario) > new Date()
    if (esProxima)               return { label: 'Próxima',    color: 'text-orange-500', icon: <ChevronRight size={13} className="text-orange-400"/> }
    if (r.estatus === 'Confirmada') return { label: 'Asistió',    color: 'text-green-600',  icon: <Check size={13} className="text-green-500"/> }
    if (r.estatus === 'Cancelada')  return { label: 'Cancelada',  color: 'text-red-500',    icon: <span className="text-red-400 text-xs">✕</span> }
    if (r.lista_espera)             return { label: 'No asistió', color: 'text-gray-400',   icon: <span className="text-gray-400 text-xs">–</span> }
    return { label: 'Pendiente', color: 'text-yellow-600', icon: <Clock size={13} className="text-yellow-500"/> }
  }

  return (
    <div className="space-y-1">
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400 italic text-center py-8">Sin reservas registradas</p>
      ) : sorted.map(r => {
        const horario  = r.clases?.horario ? new Date(r.clases.horario) : null
        const estado   = getEstadoUI(r)
        const dia      = horario?.getDate()
        const mes      = horario?.toLocaleDateString('es-MX', { month: 'short' }).toUpperCase()
        const hora     = horario?.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', hour12: false })
        const clase    = r.clases?.nombre_clase || '—'
        const coach = r.clases?.staff ? `${r.clases.staff.nombre} ${r.clases.staff.primer_apellido}`.trim() : ''
        const sucursal = r.clases?.sucursales?.nombre || ''

        return (
          <div key={r.id} className="flex items-center gap-4 px-1 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded-xl transition">
            {/* Fecha */}
            <div className="w-10 flex-shrink-0 text-center">
              <p className="text-base font-black text-gray-900 leading-tight">{dia}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase">{mes}</p>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{clase}</p>
              <p className="text-[11px] text-gray-400 truncate">
                {hora}{coach ? ` · ${coach}` : ''}{sucursal ? ` · ${sucursal}` : ''}
              </p>
            </div>

            {/* Estado */}
            <div className={`flex items-center gap-1 text-xs font-bold flex-shrink-0 ${estado.color}`}>
              {estado.icon} {estado.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}