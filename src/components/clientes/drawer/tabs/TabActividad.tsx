'use client'
import { Calendar, Check, Mail, CreditCard } from 'lucide-react'

interface Props {
  reservas:       any[]
  pagos:          any[]
  comunicaciones: any[]
}

interface EventoActividad {
  fecha:     Date
  tipo:      'reserva' | 'asistencia' | 'comunicacion' | 'pago'
  titulo:    string
  subtitulo: string
}

const TIPO_ICON: Record<string, React.ReactNode> = {
  reserva:       <Calendar size={15} className="text-gray-500"/>,
  asistencia:    <Check    size={15} className="text-green-500"/>,
  comunicacion:  <Mail     size={15} className="text-gray-500"/>,
  pago:          <CreditCard size={15} className="text-gray-500"/>,
}

export default function TabActividad({ reservas, pagos, comunicaciones }: Props) {
  // Construir timeline unificado
  const eventos: EventoActividad[] = [
    ...reservas.map(r => ({
      fecha:     new Date(r.clases?.horario || r.created_at),
      tipo:      r.estatus === 'Confirmada' ? 'asistencia' : 'reserva' as any,
      titulo:    r.estatus === 'Confirmada'
        ? `Asistió a clase`
        : `Reserva de clase ${r.clases?.nombre_clase || ''}`,
      subtitulo: [
        r.clases?.nombre_clase,
        r.clases?.staff
          ? `${r.clases.staff.nombre} ${r.clases.staff.primer_apellido}`.trim()
          : null,
        r.clases?.sucursales?.nombre
      ].filter(Boolean).join(' · '),
    })),
    ...pagos.map(p => ({
      fecha:     new Date(p.fecha_pago),
      tipo:      'pago' as const,
      titulo:    `Pago ${p.concepto || 'de membresía'}`,
      subtitulo: [`$${Number(p.monto).toLocaleString()}`, p.metodo_pago, p.sucursales?.nombre]
        .filter(Boolean).join(' · '),
    })),
    ...comunicaciones.map(c => ({
      fecha:     new Date(c.created_at),
      tipo:      'comunicacion' as const,
      titulo:    c.asunto || 'Comunicación',
      subtitulo: [c.tipo?.toUpperCase(), c.origen, c.estado].filter(Boolean).join(' · '),
    })),
  ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())

  if (eventos.length === 0) return (
    <p className="text-sm text-gray-400 italic text-center py-8">Sin actividad registrada</p>
  )

  return (
    <div className="space-y-1">
      {eventos.map((e, i) => (
        <div key={i} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
          {/* Fecha */}
          <div className="w-28 flex-shrink-0">
            <p className="text-[11px] text-gray-400">
              {e.fecha.toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' })}
            </p>
            <p className="text-[11px] text-gray-400">
              {e.fecha.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })}
            </p>
          </div>

          {/* Ícono */}
          <div className="mt-0.5 flex-shrink-0">
            {TIPO_ICON[e.tipo]}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{e.titulo}</p>
            <p className="text-[11px] text-gray-400 truncate">{e.subtitulo}</p>
          </div>
        </div>
      ))}
    </div>
  )
}