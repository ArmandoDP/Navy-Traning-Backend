'use client'

interface Props {
  total:        number
  conectadas:   number
  atencion:     number
  desconectadas:number
}

export default function IntegracionesMetricas({ total, conectadas, atencion, desconectadas }: Props) {
  const cards = [
    { label: 'Total',         value: total,         color: '#171B24' },
    { label: 'Conectadas',    value: conectadas,    color: '#22c55e' },
    { label: 'Atención',      value: atencion,      color: '#f59e0b' },
    { label: 'Desconectadas', value: desconectadas, color: '#ef4444' },
  ]

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-gray-400">{c.label}</p>
          <p className="text-2xl font-black mt-1" style={{ color: c.color }}>{c.value}</p>
        </div>
      ))}
    </div>
  )
}