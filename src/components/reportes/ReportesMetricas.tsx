'use client'

interface Props {
  nominaTotal:      number
  horasTotales:     number
  costoPorClase:    number
  totalEmpleados:   number
}

export default function ReportesMetricas({ nominaTotal, horasTotales, costoPorClase, totalEmpleados }: Props) {
  const cards = [
    {
      label: 'Nómina total',
      value: `$${nominaTotal.toLocaleString()}`,
      sub:   '+8% vs abril',
      color: '#22c55e',
    },
    {
      label: 'Total empleados',
      value: totalEmpleados,
      sub:   'activos en el período',
      color: '#171B24',
    },
    {
      label: 'Horas totales',
      value: `${horasTotales.toLocaleString()}h`,
      sub:   `${totalEmpleados} empleados`,
      color: '#3b82f6',
    },
    {
      label: 'Costo promedio / clase',
      value: `$${costoPorClase.toLocaleString()}`,
      sub:   'por clase impartida',
      color: '#f59e0b',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-gray-400">{c.label}</p>
          <p className="text-2xl font-black mt-1" style={{ color: c.color }}>{c.value}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  )
}