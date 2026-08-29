'use client'

interface Props {
  total:    number
  capacidad: number
  activos:  number
  lost:     number
  failed:   number
  expired:  number
}

export default function SucursalClientes({ total, capacidad, activos, lost, failed, expired }: Props) {
  const pct = (v: number) => total > 0 ? Math.round((v / total) * 100) : 0

  const stats = [
    { label: 'Active',  val: activos, color: '#22c55e' },
    { label: 'Lost',    val: lost,    color: '#ef4444' },
    { label: 'Failed',  val: failed,  color: '#f59e0b' },
    { label: 'Expired', val: expired, color: '#9ca3af' },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-8">
          <div>
            <p className="text-xs text-gray-400">Clientes</p>
            <p className="text-2xl font-black text-gray-900">{total}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Capacidad</p>
            <p className="text-2xl font-black text-gray-900">{capacidad}</p>
          </div>
        </div>
      </div>

      {/* Barras */}
      <div className="space-y-3">
        {stats.map(s => (
          <div key={s.label} className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 w-16 flex-shrink-0">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-xs text-gray-500">{s.label}</span>
            </div>
            <span className="text-sm font-bold text-gray-900 w-8 flex-shrink-0">{s.val}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{ width: `${pct(s.val)}%`, backgroundColor: s.color }}
              />
            </div>
            <span className="text-xs text-gray-400 w-8 text-right flex-shrink-0">{pct(s.val)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}