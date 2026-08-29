'use client'

interface Props {
  nominaSucursal: number
  empleados:      number
  horasTrabajadas:number
  costoPorClase:  number
  totalEmpresa:   number
}

export default function DetalleMetricas({ nominaSucursal, empleados, horasTrabajadas, costoPorClase, totalEmpresa }: Props) {
  const pctEmpresa = totalEmpresa > 0 ? Math.round((nominaSucursal / totalEmpresa) * 100) : 0

  const cards = [
    {
      label: 'Nómina sucursal',
      value: `$${nominaSucursal.toLocaleString()}`,
      sub:   `${pctEmpresa}% del total empresa`,
      color: '#22c55e',
    },
    {
      label: 'Empleados',
      value: empleados,
      sub:   'en este período',
      color: '#171B24',
    },
    {
      label: 'Horas trabajadas',
      value: `${horasTrabajadas.toLocaleString()} h`,
      sub:   `avg ${empleados > 0 ? Math.round(horasTrabajadas / empleados) : 0}h por empleado`,
      color: '#3b82f6',
    },
    {
      label: 'Costo / clase',
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