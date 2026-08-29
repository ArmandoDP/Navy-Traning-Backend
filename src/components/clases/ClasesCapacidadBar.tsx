interface Props {
  reservas:  number
  capacidad: number
}

export default function ClasesCapacidadBar({ reservas, capacidad }: Props) {
  const pct   = capacidad > 0 ? Math.round((reservas / capacidad) * 100) : 0
  const color = pct >= 90 ? '#ef4444' : pct >= 60 ? '#3b82f6' : '#22c55e'

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex items-center gap-1 text-sm text-gray-600">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span className="font-medium">{reservas}/{capacidad}</span>
      </div>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[60px]">
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold" style={{ color }}>{pct}%</span>
    </div>
  )
}