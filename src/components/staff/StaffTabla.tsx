'use client'
import { useState }      from 'react'
import { ChevronRight, ChevronLeft, ChevronRight as ChevronR, Pencil } from 'lucide-react'
import StaffFilters      from './StaffFilters'

interface StaffMember {
  id: string; nombre: string; primer_apellido: string; segundo_apellido: string
  email: string; tipo: string; nivel: string | null; estatus: string
  sueldo_fijo: number | null; tarifa_hora: number | null
  tipo_pago: string | null; adeudo: number | null
  created_at: string; fecha_ingreso: string | null
  staff_sucursales?: { sucursales: { id: string; nombre: string; color: string } }[]
  clases_count?: number; horas_count?: number; ocupacion_pct?: number
  bono_periodo?: number
}

interface Props {
  staff:    StaffMember[]
  onEditar: (s: StaffMember) => void
  onVer:    (s: StaffMember) => void
}

const POR_PAGINA = 15

// Colores de nivel con dot
const NIVEL_CONFIG: Record<string, { dot: string; label: string }> = {
  'Lead':        { dot: '#9ca3af', label: 'Lead' },
  'Junior':      { dot: '#9ca3af', label: 'Junior' },
  'Marine':      { dot: '#06b6d4', label: 'Marine' },
  'Semi-senior': { dot: '#3b82f6', label: 'Semi-senior' },
  'Senior':      { dot: '#22c55e', label: 'Senior' },
  'Elite':       { dot: '#f59e0b', label: 'Elite' },
}

const TIPO_COLORS: Record<string, string> = {
  'Coach':         '#6366f1',
  'Manager':       '#10b981',
  'Submanager':    '#14b8a6',
  'Regional':      '#8b5cf6',
  'Front':         '#ec4899',
  'Staff general': '#6b7280',
  'Limpieza':      '#f97316',
  'Mantto':        '#f59e0b',
}

// Genera color de fondo suave a partir del color hex
function hexToSoftBg(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},0.12)`
}

function BadgeTipo({ tipo }: { tipo: string }) {
  const color = TIPO_COLORS[tipo] || '#6b7280'
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold"
      style={{ color, backgroundColor: hexToSoftBg(color) }}>
      {tipo}
    </span>
  )
}

function BadgeSucursal({ nombre, color }: { nombre: string; color: string }) {
  const bg = color ? hexToSoftBg(color) : '#f3f4f6'
  const tc = color || '#6b7280'
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold"
      style={{ color: tc, backgroundColor: bg }}>
      {nombre}
    </span>
  )
}

function BadgeNivel({ nivel }: { nivel: string | null }) {
  if (!nivel) return <span className="text-xs text-gray-300">-</span>
  const cfg = NIVEL_CONFIG[nivel]
  if (!cfg) return <span className="text-xs text-gray-500">{nivel}</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
      {cfg.label}
    </span>
  )
}

function CeldaHoras({ horas, tipoPago, adeudo }: {
  horas: number | null; tipoPago: string | null; adeudo: number | null
}) {
  const tieneAdeudo = adeudo && adeudo > 0
  return (
    <div>
      <p className="text-sm font-bold text-gray-800">{horas ? `${horas}h` : '-'}</p>
      {tieneAdeudo
        ? <p className="text-[11px] text-amber-500 font-medium flex items-center gap-1">
            ⚠ ${Number(adeudo).toLocaleString()} adeudo
          </p>
        : <p className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
            ✓ {tipoPago === 'Fijo' ? 'Sueldo fijo'
               : tipoPago === 'Fijo quincenal' ? 'Quincenal'
               : tipoPago === 'Fijo mensual' ? 'Mensual'
               : 'Al día'}
          </p>
      }
    </div>
  )
}

function CeldaNomina({ sueldoFijo, tarifaHora, bonoPeriodo, tipoPago, adeudo }: {
  sueldoFijo: number | null; tarifaHora: number | null
  bonoPeriodo: number | null; tipoPago: string | null; adeudo: number | null
}) {
  const monto = sueldoFijo || 0
  const tarifa = tarifaHora || 0
  const bono = bonoPeriodo || 0
  const tieneAdeudo = adeudo && adeudo > 0

  return (
    <div>
      <p className="text-sm font-bold text-gray-900">${monto.toLocaleString()}</p>
      {tarifa > 0 &&
        <p className="text-[11px] text-gray-400">${tarifa}/h</p>
      }
      {bono > 0 &&
        <p className="text-[11px] text-emerald-500 font-medium">+{bono.toLocaleString()} bono</p>
      }
      {tieneAdeudo &&
        <p className="text-[11px] text-red-400 font-medium">- ${Number(adeudo).toLocaleString()} adeudo</p>
      }
      <p className="text-[11px] text-gray-400">
        {tipoPago === 'Fijo' ? 'Fijo'
        : tipoPago === 'Fijo quincenal' ? 'Fijo quincenal'
        : tipoPago === 'Fijo mensual' ? 'Fijo'
        : 'Por hora'}
      </p>
    </div>
  )
}

export default function StaffTabla({ staff, onEditar, onVer }: Props) {
  const [pagina,  setPagina]  = useState(1)
  const [orden,   setOrden]   = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: '', dir: 'asc' })
  const [filtros, setFiltros] = useState({ nombre: '', tipo: '', sucursal: '', estatus: '' })

  const setFiltro = (k: string, v: string) => { setFiltros(p => ({ ...p, [k]: v })); setPagina(1) }
  const limpiar   = () => { setFiltros({ nombre: '', tipo: '', sucursal: '', estatus: '' }); setPagina(1) }

  const toggleOrden = (col: string) =>
    setOrden(o => ({ col, dir: o.col === col && o.dir === 'asc' ? 'desc' : 'asc' }))
  const sortIcon = (col: string) =>
    <span className="text-gray-300 ml-0.5 text-[10px]">
      {orden.col === col ? (orden.dir === 'asc' ? '↑' : '↓') : '↕'}
    </span>

  const filtrados = staff.filter(s => {
    const nombre = `${s.nombre} ${s.primer_apellido} ${s.segundo_apellido}`.toLowerCase()
    return (
      (!filtros.nombre  || nombre.includes(filtros.nombre.toLowerCase()) || s.email?.toLowerCase().includes(filtros.nombre.toLowerCase())) &&
      (!filtros.tipo    || s.tipo === filtros.tipo) &&
      (!filtros.estatus || s.estatus === filtros.estatus)
    )
  })

  const ordenados = [...filtrados].sort((a, b) => {
    if (!orden.col) return 0
    const map: Record<string, [any, any]> = {
      nombre: [a.nombre, b.nombre],
      tipo:   [a.tipo, b.tipo],
      nivel:  [a.nivel || '', b.nivel || ''],
      nomina: [a.sueldo_fijo || 0, b.sueldo_fijo || 0],
      clases: [a.clases_count || 0, b.clases_count || 0],
      horas:  [a.horas_count || 0, b.horas_count || 0],
      ocupacion: [a.ocupacion_pct || 0, b.ocupacion_pct || 0],
    }
    const [va, vb] = map[orden.col] || ['', '']
    if (typeof va === 'number') return orden.dir === 'asc' ? va - vb : vb - va
    return orden.dir === 'asc'
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va))
  })

  const totalPags = Math.max(Math.ceil(ordenados.length / POR_PAGINA), 1)
  const paginados = ordenados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const nombreCompleto = (s: StaffMember) =>
    `${s.nombre} ${s.primer_apellido || ''} ${s.segundo_apellido || ''}`.trim()

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-700">
          {filtrados.length} Miembros del Staff
          <span className="text-gray-400 font-normal ml-1">(0 seleccionados)</span>
        </span>
        <StaffFilters filtros={filtros} onChange={setFiltro} onLimpiar={limpiar} />
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-gray-100 bg-white">
            <tr>
              <th className="px-4 py-3 w-8">
                <input type="checkbox" className="rounded border-gray-300 cursor-pointer" />
              </th>
              <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                onClick={() => toggleOrden('nombre')}>
                Empleado {sortIcon('nombre')}
              </th>
              <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                onClick={() => toggleOrden('tipo')}>
                Tipo {sortIcon('tipo')}
              </th>
              <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                onClick={() => toggleOrden('sucursal')}>
                Sucursales {sortIcon('sucursal')}
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('nivel')}>
                <p className="text-xs font-bold text-gray-500 uppercase">Nivel {sortIcon('nivel')}</p>
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('clases')}>
                <p className="text-xs font-bold text-gray-500 uppercase">Clases {sortIcon('clases')}</p>
                <p className="text-[10px] font-bold text-gray-300 uppercase">MES</p>
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('ocupacion')}>
                <p className="text-xs font-bold text-gray-500 uppercase">Ocupación {sortIcon('ocupacion')}</p>
                <p className="text-[10px] font-bold text-gray-300 uppercase">PROMEDIO</p>
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('horas')}>
                <p className="text-xs font-bold text-gray-500 uppercase">Horas {sortIcon('horas')}</p>
                <p className="text-[10px] font-bold text-gray-300 uppercase">PERÍODO</p>
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('nomina')}>
                <p className="text-xs font-bold text-gray-500 uppercase">Nómina {sortIcon('nomina')}</p>
                <p className="text-[10px] font-bold text-gray-300 uppercase">PERÍODO</p>
              </th>
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paginados.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-gray-400 italic text-sm">
                  No hay empleados
                </td>
              </tr>
            ) : paginados.map(s => (
              <tr key={s.id} className="hover:bg-gray-50 transition">

                {/* Checkbox */}
                <td className="px-4 py-3">
                  <input type="checkbox" className="rounded border-gray-300 cursor-pointer" />
                </td>

                {/* Empleado */}
                <td className="px-4 py-3 min-w-[200px]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-black text-gray-500 flex-shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <button onClick={() => onVer(s)}
                        className="text-sm font-semibold text-gray-900 hover:text-indigo-600 transition truncate block text-left">
                        {nombreCompleto(s)}
                      </button>
                      <p className="text-[11px] text-gray-400 truncate">{s.email}</p>
                    </div>
                  </div>
                </td>

                {/* Tipo */}
                <td className="px-4 py-3">
                  <BadgeTipo tipo={s.tipo} />
                </td>

                {/* Sucursales */}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 max-w-[180px]">
                    {s.staff_sucursales && s.staff_sucursales.length > 0
                      ? s.staff_sucursales.map((ss, i) => (
                          <BadgeSucursal
                            key={i}
                            nombre={ss.sucursales?.nombre}
                            color={ss.sucursales?.color || '#6b7280'}
                          />
                        ))
                      : <span className="text-xs text-gray-300">—</span>
                    }
                  </div>
                </td>

                {/* Nivel */}
                <td className="px-4 py-3">
                  <BadgeNivel nivel={s.nivel} />
                </td>

                {/* Clases */}
                <td className="px-4 py-3 text-sm font-bold text-gray-800">
                  {s.clases_count ?? '-'}
                </td>

                {/* Ocupación */}
                <td className="px-4 py-3">
                  {s.ocupacion_pct != null
                    ? <span className={`text-sm font-bold ${s.ocupacion_pct >= 80 ? 'text-emerald-500' : s.ocupacion_pct >= 60 ? 'text-amber-500' : 'text-red-400'}`}>
                        {s.ocupacion_pct}%
                      </span>
                    : <span className="text-sm text-gray-300">-</span>
                  }
                </td>

                {/* Horas */}
                <td className="px-4 py-3">
                  <CeldaHoras
                    horas={s.horas_count || null}
                    tipoPago={s.tipo_pago}
                    adeudo={s.adeudo}
                  />
                </td>

                {/* Nómina */}
                <td className="px-4 py-3">
                  <CeldaNomina
                    sueldoFijo={s.sueldo_fijo}
                    tarifaHora={s.tarifa_hora}
                    bonoPeriodo={s.bono_periodo || null}
                    tipoPago={s.tipo_pago}
                    adeudo={s.adeudo}
                  />
                </td>

                {/* Acciones */}
                <td className="px-4 py-3">
                  <button onClick={() => onVer(s)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-indigo-600 transition">
                    <ChevronRight size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
        <div className="flex items-center gap-1">
          <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-30 transition">
            <ChevronLeft size={15} />
          </button>
          {Array.from({ length: Math.min(totalPags, 5) }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => setPagina(n)}
              className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                pagina === n ? 'bg-gray-900 text-white' : 'hover:bg-gray-100 text-gray-500'
              }`}>
              {n}
            </button>
          ))}
          {totalPags > 5 && <>
            <span className="text-gray-400 text-xs px-1">...</span>
            <button onClick={() => setPagina(totalPags)}
              className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                pagina === totalPags ? 'bg-gray-900 text-white' : 'hover:bg-gray-100 text-gray-500'
              }`}>
              {totalPags}
            </button>
          </>}
          <button onClick={() => setPagina(p => Math.min(totalPags, p + 1))} disabled={pagina === totalPags}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-30 transition">
            <ChevronR size={15} />
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Resultados por página <span className="font-bold text-gray-600">{POR_PAGINA}</span>
        </p>
      </div>
    </div>
  )
}