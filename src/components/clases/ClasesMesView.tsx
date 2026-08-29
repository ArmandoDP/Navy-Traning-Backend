'use client'
import Link from 'next/link'

interface Clase {
  id: string; nombre_clase: string; tipo_clase: string; tipo_display: string
  color: string; horario: string
}

interface Props {
  clases:      Clase[]
  fechaActiva: Date
  onDiaClick:  (fecha: Date) => void
}

const DIAS  = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const TIPO_COLORS: Record<string, string> = {
  Hybrid: '#3b82f6', Hyrox: '#22c55e', Spinning: '#f97316',
  Yoga: '#8b5cf6', Box: '#ef4444', Funcional: '#6366f1', General: '#9ca3af',
}

export default function ClasesMesView({ clases, fechaActiva, onDiaClick }: Props) {
  const mes   = fechaActiva.getMonth()
  const anio  = fechaActiva.getFullYear()
  const hoy   = new Date()

  // Primer día del mes (ajustado a Lunes = 0)
  const primerDia = new Date(anio, mes, 1)
  let offset = primerDia.getDay() - 1
  if (offset < 0) offset = 6

  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const celdas    = Array.from({ length: offset + diasEnMes }, (_, i) =>
    i < offset ? null : i - offset + 1
  )

  const clasesDia = (dia: number) =>
    clases.filter(c => {
      const f = new Date(c.horario)
      return f.getFullYear() === anio && f.getMonth() === mes && f.getDate() === dia
    })

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Cabecera días */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DIAS.map(d => (
          <div key={d} className="py-3 text-center text-xs font-bold text-gray-400 uppercase">{d}</div>
        ))}
      </div>

      {/* Celdas */}
      <div className="grid grid-cols-7 divide-x divide-y divide-gray-100">
        {celdas.map((dia, i) => {
          const esHoy = dia === hoy.getDate() && mes === hoy.getMonth() && anio === hoy.getFullYear()
          const cls   = dia ? clasesDia(dia) : []
          const fecha = dia ? new Date(anio, mes, dia) : null

          return (
            <div key={i}
              onClick={() => fecha && onDiaClick(fecha)}
              className={`min-h-[100px] p-2 transition ${!dia ? 'bg-gray-50' : 'hover:bg-gray-50 cursor-pointer'}`}>
              {dia && (
                <>
                  <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1.5 ${
                    esHoy ? 'bg-indigo-600 text-white' : 'text-gray-500'
                  }`}>
                    {dia}
                  </span>
                  <div className="space-y-0.5">
                    {cls.slice(0, 3).map(c => {
                      const tipo  = c.tipo_display || c.tipo_clase || 'General'
                      const color = c.color && c.color !== '#6366f1' ? c.color : (TIPO_COLORS[tipo] || TIPO_COLORS['General'])
                      return (
                        <Link key={c.id} href={`/dashboard/clases/${c.id}`}
                          onClick={e => e.stopPropagation()}
                          className="block text-[10px] font-bold px-1.5 py-0.5 rounded truncate hover:opacity-80 transition"
                          style={{ backgroundColor: `${color}18`, color, borderLeft: `2px solid ${color}` }}>
                          {new Date(c.horario).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', hour12: false })} {c.nombre_clase}
                        </Link>
                      )
                    })}
                    {cls.length > 3 && (
                      <p className="text-[10px] text-gray-400 pl-1">+{cls.length - 3} más</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}