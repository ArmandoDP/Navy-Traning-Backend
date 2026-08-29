'use client'

interface Props {
  checkins: any[]
}

export default function CheckinContadores({ checkins }: Props) {
  const hoy      = new Date().toDateString()
  const deHoy    = checkins.filter(c => new Date(c.fecha_checkin).toDateString() === hoy)
  const nuevos   = deHoy.filter(c => c.clientes?.es_invitado === false)
  const porClase = deHoy.reduce((acc: Record<string, number>, c) => {
    const nombre = c.clases?.nombre_clase || 'Sin clase'
    acc[nombre]  = (acc[nombre] || 0) + 1
    return acc
  }, {})
  const claseTop = Object.entries(porClase).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: 'Check-ins hoy',  val: deHoy.length,        color: 'text-gray-900',   bg: 'bg-white' },
        { label: 'Nuevos clientes', val: nuevos.length,       color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { label: 'Clase más activa', val: claseTop?.[0] || '—', color: 'text-emerald-600', bg: 'bg-emerald-50', small: true },
      ].map(m => (
        <div key={m.label} className={`${m.bg} border border-gray-200 rounded-2xl p-4 shadow-sm`}>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{m.label}</p>
          <p className={`font-black mt-1 ${m.color} ${m.small ? 'text-sm mt-2' : 'text-2xl'}`}>{m.val}</p>
        </div>
      ))}
    </div>
  )
}