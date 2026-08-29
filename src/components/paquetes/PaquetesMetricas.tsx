'use client'

interface Props {
  totalPaquetes:   number
  miembrosActivos: number
  ingresosTotales: number
  tasaAsistencia:  number
}

export default function PaquetesMetricas({ totalPaquetes, miembrosActivos, ingresosTotales, tasaAsistencia }: Props) {
  const cards = [
    {
      label: 'Total paquetes',
      value: totalPaquetes,
      sub:   'en 6 sucursales',
      color: '#171B24',
    },
    {
      label: 'Miembros activos',
      value: miembrosActivos.toLocaleString(),
      sub:   '+34 este mes',
      color: '#171B24',
    },
    {
      label: 'Ingresos totales',
      value: `$${ingresosTotales.toLocaleString()}`,
      sub:   '+12% vs abril',
      color: '#22c55e',
    },
    {
      label: 'Tasa de asistencia',
      value: `${tasaAsistencia}%`,
      sub:   'vs 85% en abril',
      color: tasaAsistencia >= 85 ? '#22c55e' : '#f59e0b',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(card => (
        <div key={card.label}
          className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm flex flex-col gap-1">
          <p className="text-xs font-medium text-gray-400">{card.label}</p>
          <p className="text-2xl font-black" style={{ color: card.color }}>{card.value}</p>
          <p className="text-[11px] text-gray-400">{card.sub}</p>
        </div>
      ))}
    </div>
  )
}