'use client'
import { useState } from 'react'
import { ChevronRight, ChevronLeft, ChevronRight as ChevronR } from 'lucide-react'
import { BadgeEstatus, BadgeSucursal, AsistenciaBar, BadgeMembresia } from './ClientesBadges'
import ClientesFilters    from './ClientesFilters'
import ClientesBulkActions from './ClientesBulkActions'

interface Cliente {
  id: string; nombre_completo: string; email: string
  estatus: string; plan: string; sucursal_id?: string
  fecha_vencimiento_memb?: string; fecha_venc_plan?: string
  valor_cliente?: number; asistencia_pct?: number
  created_at: string; perdido?: boolean
  sucursales?: { nombre: string; color: string }
  pagos?: any[]
  origen?:           string
  password_temporal?: string
  debe_cambiar_password?: boolean
  supabase_user_id?: string
  fecha_alta_original?: string
  membresias?:       any[]
}

interface Props {
  clientes:        Cliente[]
  onRefresh:       () => void
  onRenovar:       (ids: string[]) => void
  onMarcarPerdido: (ids: string[]) => void
  onCambiarPaquete:(ids: string[]) => void
  onEditarCliente: (cliente: Cliente) => void   // ← nuevo
  onVerCliente:    (cliente: Cliente) => void   // ← nuevo
}

type Tab = 'todo' | 'vence7' | 'riesgo'
const POR_PAGINA = 15

function getSortVal(c: Cliente, col: string) {
  if (col === 'nombre')    return c.nombre_completo || ''
  if (col === 'sucursal')  return c.sucursales?.nombre || ''
  if (col === 'plan')      return c.plan || ''
  if (col === 'fecha')     return c.created_at || ''
  if (col === 'estado')    return c.estatus || ''
  if (col === 'asistencia')return c.asistencia_pct || 0
  if (col === 'valor')     return c.valor_cliente || 0
  return ''
}

export default function ClientesTabla({ clientes, onRefresh, onRenovar, onMarcarPerdido, onCambiarPaquete, onEditarCliente, onVerCliente }: Props) {
  const [tab,       setTab]       = useState<Tab>('todo')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [pagina,    setPagina]    = useState(1)
  const [orden,     setOrden]     = useState<{ col: string; dir: 'asc'|'desc' }>({ col: '', dir: 'asc' })
  const [filtros,   setFiltros]   = useState({ nombre: '', sucursal: '', plan: '', fecha: '', estado: '' })

  const hoy = new Date()

  // ── Filtrar por tab ──────────────────────────────────────────────────────────
  const porTab = clientes.filter(c => {
    if (tab === 'todo')   return true
    if (tab === 'vence7') {
      const fecha = c.fecha_vencimiento_memb || c.fecha_venc_plan
      if (!fecha) return false
      const dias = Math.ceil((new Date(fecha).getTime() - hoy.getTime()) / (1000 * 3600 * 24))
      return dias >= 0 && dias <= 7
    }
    if (tab === 'riesgo') return (c.asistencia_pct || 0) < 50
    return true
  })

  // ── Filtros ──────────────────────────────────────────────────────────────────
  const filtrados = porTab.filter(c => {
    const nombre   = c.nombre_completo?.toLowerCase() || ''
    const email    = c.email?.toLowerCase() || ''
    const sucursal = c.sucursales?.nombre?.toLowerCase() || ''
    const plan     = c.plan?.toLowerCase() || ''
    const fecha    = c.created_at?.slice(0,10) || ''
    return (
      (!filtros.nombre   || nombre.includes(filtros.nombre.toLowerCase()) || email.includes(filtros.nombre.toLowerCase())) &&
      (!filtros.sucursal || sucursal.includes(filtros.sucursal.toLowerCase())) &&
      (!filtros.plan     || plan.includes(filtros.plan.toLowerCase()))          &&
      (!filtros.fecha    || fecha === filtros.fecha)                             &&
      (!filtros.estado   || c.estatus === filtros.estado)
    )
  })

  // ── Ordenar ──────────────────────────────────────────────────────────────────
  const ordenados = [...filtrados].sort((a, b) => {
    if (!orden.col) return 0
    const va = getSortVal(a, orden.col)
    const vb = getSortVal(b, orden.col)
    if (typeof va === 'number') return orden.dir === 'asc' ? va - (vb as number) : (vb as number) - va
    return orden.dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
  })

  // ── Paginación ────────────────────────────────────────────────────────────────
  const totalPags = Math.max(Math.ceil(ordenados.length / POR_PAGINA), 1)
  const paginados = ordenados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  // ── Selección ─────────────────────────────────────────────────────────────────
  const toggleAll = () => {
    if (seleccion.size === paginados.length) setSeleccion(new Set())
    else setSeleccion(new Set(paginados.map(c => c.id)))
  }
  const toggleOne = (id: string) => {
    const s = new Set(seleccion); s.has(id) ? s.delete(id) : s.add(id); setSeleccion(s)
  }

  const setFiltro = (k: string, v: string) => { setFiltros(p => ({ ...p, [k]: v })); setPagina(1) }
  const limpiar   = () => { setFiltros({ nombre:'', sucursal:'', plan:'', fecha:'', estado:'' }); setPagina(1) }
  const toggleOrden = (col: string) => setOrden(o => ({ col, dir: o.col === col && o.dir === 'asc' ? 'desc' : 'asc' }))
  const sortIcon = (col: string) => <span className="text-gray-300 ml-0.5 text-[10px]">{orden.col === col ? (orden.dir === 'asc' ? '↑' : '↓') : '↕'}</span>

  const antiguedad = (fecha: string) => {
    const dias = Math.floor((hoy.getTime() - new Date(fecha).getTime()) / (1000 * 3600 * 24))
    if (dias < 30)  return `${dias}d`
    if (dias < 365) return `${Math.floor(dias/30)} mes`
    return `${Math.floor(dias/365)} año`
  }

  const TABS = [
    { key: 'todo',   label: '⊙ Todo' },
    { key: 'vence7', label: '⏰ Vence en 7 días' },
    { key: 'riesgo', label: '⚠ Riesgo de No-show' },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

      {/* Tabs — ancho completo */}
      <div className="grid grid-cols-3 border-b border-gray-100">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key as Tab); setPagina(1); setSeleccion(new Set()) }}
            className={`py-3.5 text-sm font-medium transition border-b-2 text-center ${
              tab === t.key ? 'border-gray-900 text-gray-900 font-bold' : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contador + Bulk + Filtros */}
      <div className="px-5 py-3 border-b border-gray-100 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 font-medium">
            {filtrados.length} Clientes
            {seleccion.size > 0 && <span className="text-indigo-600 font-bold ml-1">({seleccion.size} seleccionados)</span>}
          </span>
          {seleccion.size > 0 && (
            <ClientesBulkActions
              cantidad={seleccion.size}
              onCambiarPaquete={() => onCambiarPaquete([...seleccion])}
              onRenovar={() => onRenovar([...seleccion])}
              onMarcarPerdido={() => { onMarcarPerdido([...seleccion]); setSeleccion(new Set()) }}
            />
          )}
        </div>
        <ClientesFilters filtros={filtros} onChange={setFiltro} onLimpiar={limpiar} />
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-gray-400 text-[11px] font-bold uppercase border-b border-gray-100 bg-white">
            <tr>
              <th className="px-4 py-3 w-8">
                <input type="checkbox"
                  checked={seleccion.size === paginados.length && paginados.length > 0}
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-indigo-600 cursor-pointer" />
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('nombre')}>Cliente {sortIcon('nombre')}</th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('sucursal')}>Sucursal {sortIcon('sucursal')}</th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('plan')}>Plan {sortIcon('plan')}</th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('fecha')}>Fecha {sortIcon('fecha')}</th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('estado')}>Estado {sortIcon('estado')}</th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('asistencia')}>Asistencia {sortIcon('asistencia')}</th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('valor')}>Valor {sortIcon('valor')}</th>
              <th className="px-4 py-3">Antigüedad</th>
              <th className="px-4 py-3">Membresía</th>
              <th className="px-4 py-3 w-8"/>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paginados.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-400 italic text-sm">No hay clientes</td></tr>
            ) : paginados.map(c => (
              <tr key={c.id} className={`transition hover:bg-gray-50 ${seleccion.has(c.id) ? 'bg-indigo-50/40' : ''}`}>

                {/* Checkbox */}
                <td className="px-4 py-3">
                  <input type="checkbox" checked={seleccion.has(c.id)} onChange={() => toggleOne(c.id)}
                    className="rounded border-gray-300 text-indigo-600 cursor-pointer" />
                </td>

                {/* Cliente */}
                <td className="px-4 py-3 min-w-[180px]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-black text-gray-600 flex-shrink-0">
                      {c.nombre_completo?.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => onVerCliente(c)}
                          className="text-sm font-semibold text-gray-900 hover:text-indigo-600 transition truncate block text-left">
                          {c.nombre_completo}
                        </button>
                        {/* Badge migración */}
                        {c.origen === 'Migración' && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-600 uppercase tracking-wide">
                            MIG
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 truncate">{c.email}</p>
                    </div>
                  </div>
                </td>

                {/* Sucursal */}
                <td className="px-4 py-3">
                  {c.sucursales?.nombre
                    ? <BadgeSucursal nombre={c.sucursales.nombre} />
                    : <span className="text-xs text-gray-300">—</span>}
                </td>

                {/* Plan */}
                <td className="px-4 py-3 min-w-[140px]">
                  <p className="text-xs font-bold text-gray-800 truncate">{c.plan || '—'}</p>
                  <p className="text-[10px] text-gray-400">Studio + Gym</p>
                </td>

                {/* Fecha */}
                <td className="px-4 py-3 min-w-[100px]">
                  <p className="text-xs text-gray-700">
                    {new Date(c.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\//g,'-')}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {(() => {
                      const fecha = c.fecha_vencimiento_memb || c.fecha_venc_plan
                      if (!fecha) return ''
                      const dias = Math.ceil((new Date(fecha).getTime() - hoy.getTime()) / (1000 * 3600 * 24))
                      if (dias < 0) return 'Expirado'
                      return `En ${dias}d`
                    })()}
                  </p>
                </td>

                {/* Estado */}
                <td className="px-4 py-3">
                  <BadgeEstatus estatus={c.perdido ? 'Perdido' : c.estatus} />
                </td>

                {/* Asistencia */}
                <td className="px-4 py-3">
                  <AsistenciaBar pct={c.asistencia_pct || 0} />
                </td>
                
                {/* Valor */}
                <td className="px-4 py-3 text-sm font-bold text-gray-900">
                  {c.valor_cliente ? `$${Number(c.valor_cliente).toLocaleString()}` : '—'}
                </td>

                {/* Antigüedad */}
                <td className="px-4 py-3 text-xs text-gray-600">
                  {antiguedad(c.created_at)}
                </td>

                {/* Membresía */}
                <td className="px-4 py-3">
                  {(() => {
                    const membActiva = c.membresias?.find((m: any) => m.estatus === 'Activa')
                    return (
                      <BadgeMembresia
                        fecha={membActiva?.fecha_fin || c.fecha_vencimiento_memb || c.fecha_venc_plan}
                        estatus={c.perdido ? 'Perdido' : c.estatus}
                      />
                    )
                  })()}
                </td>

                {/* Acciones */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEditarCliente(c)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-600 transition text-xs font-bold">
                      Editar
                    </button>
                    <button
                      onClick={() => onVerCliente(c)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-700 text-white transition text-xs font-bold">
                      Ver
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
        <div className="flex items-center gap-1">
          <button onClick={() => setPagina(p => Math.max(1, p-1))} disabled={pagina === 1}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-30 transition">
            <ChevronLeft size={15}/>
          </button>
          {Array.from({ length: Math.min(totalPags, 5) }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => setPagina(n)}
              className={`w-7 h-7 rounded-lg text-xs font-bold transition ${pagina === n ? 'bg-gray-900 text-white' : 'hover:bg-gray-100 text-gray-500'}`}>
              {n}
            </button>
          ))}
          {totalPags > 5 && <>
            <span className="text-gray-400 text-xs px-1">...</span>
            <button onClick={() => setPagina(totalPags)}
              className={`w-7 h-7 rounded-lg text-xs font-bold transition ${pagina === totalPags ? 'bg-gray-900 text-white' : 'hover:bg-gray-100 text-gray-500'}`}>
              {totalPags}
            </button>
          </>}
          <button onClick={() => setPagina(p => Math.min(totalPags, p+1))} disabled={pagina === totalPags}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-30 transition">
            <ChevronR size={15}/>
          </button>
        </div>
        <p className="text-xs text-gray-400">Resultados por página <span className="font-bold text-gray-600">{POR_PAGINA}</span></p>
      </div>
    </div>
  )
}