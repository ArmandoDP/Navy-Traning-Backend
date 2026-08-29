// ─── Badge Estatus ────────────────────────────────────────────────────────────
export function BadgeEstatus({ estatus }: { estatus: string }) {
  const styles: Record<string, string> = {
    'Activo':         'bg-green-100 text-green-700',
    'Expirado':       'bg-red-100 text-red-600',
    'Vencido':        'bg-red-100 text-red-600',
    'Pago fallido':   'bg-yellow-100 text-yellow-700',
    'Inactivo':       'bg-gray-100 text-gray-500',
    'Perdido':        'bg-gray-800 text-white',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${styles[estatus] || 'bg-gray-100 text-gray-500'}`}>
      {estatus}
    </span>
  )
}

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
    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold text-white"
      style={{ backgroundColor: color }}>
      {nombre}
    </span>
  )
}

// ─── Barra Asistencia ─────────────────────────────────────────────────────────
export function AsistenciaBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(pct,100)}%`, backgroundColor: color }}/>
      </div>
      <span className="text-xs font-bold w-8 text-right" style={{ color }}>{pct}%</span>
    </div>
  )
}

// ─── Badge Membresía ──────────────────────────────────────────────────────────
export function BadgeMembresia({ fecha, estatus }: { fecha?: string; estatus: string }) {
  if (!fecha) return <span className="text-xs text-gray-400">—</span>

  const dias = Math.ceil((new Date(fecha).getTime() - Date.now()) / (1000 * 3600 * 24))

  if (estatus === 'Perdido') return (
    <span className="text-xs text-gray-400">Perdido</span>
  )
  if (dias <= 0) return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-600">Expirado</span>
  )
  if (dias <= 7) return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-orange-500 font-bold">Vence en {dias}d</span>
      <button className="text-[10px] text-indigo-600 font-bold hover:underline">Renovar</button>
    </div>
  )
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-gray-400">{new Date(fecha).toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' })}</span>
      <button className="text-[10px] text-indigo-600 font-bold hover:underline">Renovar</button>
    </div>
  )
}