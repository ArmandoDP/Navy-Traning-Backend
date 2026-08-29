'use client'

interface Stat {
  label: string
  value: string
}

interface Props {
  stats: Stat[]
}

export default function IntegracionStats({ stats }: Props) {
  if (stats.length === 0) return null

  return (
    <div className={`grid gap-4 ${stats.length === 4 ? 'grid-cols-4' : 'grid-cols-2'}`}>
      {stats.map(s => (
        <div key={s.label} className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-gray-400">{s.label}</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{s.value}</p>
        </div>
      ))}
    </div>
  )
}