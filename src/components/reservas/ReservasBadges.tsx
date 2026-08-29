// ─── Badge Sucursal ───────────────────────────────────────────────────────────
const SUCURSAL_COLORS: Record<string, string> = {
  Juriquilla: '#6366f1',
  Refugio:    '#f97316',
  Lomas:      '#22c55e',
  Interlomas: '#3b82f6',
}

function getSucursalColor(nombre: string) {
  const key = Object.keys(SUCURSAL_COLORS).find(k => nombre?.includes(k))
  return key ? SUCURSAL_COLORS[key] : '#6366f1'
}

export function BadgeSucursal({ nombre }: { nombre: string }) {
  const color = getSucursalColor(nombre)
  return (
    <span
      className="px-2 py-0.5 rounded-md text-[11px] font-bold text-white"
      style={{ backgroundColor: color }}
    >
      {nombre}
    </span>
  )
}

// ─── Badge Estatus reserva ────────────────────────────────────────────────────
const ESTATUS_STYLE: Record<string, string> = {
  Confirmada: 'bg-green-100 text-green-700',
  Pendiente:  'bg-yellow-100 text-yellow-700',
  Cancelada:  'bg-red-100 text-red-600',
}

export function BadgeEstatus({ estatus }: { estatus: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${ESTATUS_STYLE[estatus] || 'bg-gray-100 text-gray-500'}`}>
      {estatus}
    </span>
  )
}

// ─── Badge Asistencia ─────────────────────────────────────────────────────────
export function BadgeAsistencia({ asistio }: { asistio: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${asistio ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {asistio ? 'Asistió a clase' : 'No asistió'}
    </span>
  )
}

// ─── Badge Tipo llegada ───────────────────────────────────────────────────────
const TIPO_STYLE: Record<string, string> = {
  'A tiempo':     'bg-green-100 text-green-700',
  'Tarde':        'bg-yellow-100 text-yellow-700',
  'Última hora':  'bg-red-100 text-red-600',
}

export function BadgeTipo({ tipo }: { tipo: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${TIPO_STYLE[tipo] || 'bg-gray-100 text-gray-500'}`}>
      {tipo || 'A tiempo'}
    </span>
  )
}

// ─── Badge Impacto ────────────────────────────────────────────────────────────
const IMPACTO_STYLE: Record<string, string> = {
  Bajo:  'bg-green-100 text-green-700',
  Medio: 'bg-yellow-100 text-yellow-700',
  Alto:  'bg-red-100 text-red-600',
}

export function BadgeImpacto({ impacto }: { impacto: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${IMPACTO_STYLE[impacto] || 'bg-gray-100 text-gray-500'}`}>
      {impacto || 'Bajo'}
    </span>
  )
}

// ─── Badge Penalización ───────────────────────────────────────────────────────
const PENALIZACION_STYLE: Record<string, string> = {
  Cobrada:   'bg-green-100 text-green-700',
  Pendiente: 'bg-yellow-100 text-yellow-700',
}

export function BadgePenalizacion({ estado }: { estado: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${PENALIZACION_STYLE[estado] || 'bg-gray-100 text-gray-500'}`}>
      {estado || 'Pendiente'}
    </span>
  )
}