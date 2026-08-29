'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, MoreHorizontal,
  CheckCircle, Clock, XCircle, Eye, RotateCcw,
  MessageSquare, Check, Calendar, X as XIcon
} from 'lucide-react'
import ReservasBulkActions from './ReservasBulkActions'
import {
  BadgeSucursal, BadgeEstatus,
  BadgeTipo, BadgeImpacto, BadgePenalizacion
} from './ReservasBadges'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Reserva {
  id:           string
  estatus:      string
  lista_espera: boolean
  tipo_llegada: string
  impacto:      string
  penalizacion: string
  reincidencia: number
  created_at:   string
  clientes:     { id: string; nombre_completo: string; email: string; telefono?: string }
  clases:       { id: string; nombre_clase: string; horario: string; tipo_clase: string; sucursales?: { nombre: string } }
}

type Tab = 'activas' | 'cancelaciones' | 'no-shows'

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'activas',       label: 'Reservas activas', icon: <CheckCircle size={13}/> },
  { key: 'cancelaciones', label: 'Cancelaciones',    icon: <Clock       size={13}/> },
  { key: 'no-shows',      label: 'No-shows',         icon: <XCircle     size={13}/> },
]

const POR_PAGINA = 15

// ─── Checkbox Asistencia ──────────────────────────────────────────────────────
function AsistenciaCheck({ reservaId, estatus, onUpdate }: {
  reservaId: string
  estatus:   string
  onUpdate:  () => void
}) {
  const [loading, setLoading] = useState(false)

  const handleAsistio = async (asistio: boolean) => {
    setLoading(true)
    const nuevoEstatus = asistio ? 'Confirmada' : 'Cancelada'
    await supabase.from('reservas').update({ estatus: nuevoEstatus }).eq('id', reservaId)
    onUpdate()
    setLoading(false)
  }

  // Ya confirmada = asistió
  if (estatus === 'Confirmada') {
    return (
      <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
        <Check size={13}/> Asistió a clase
      </div>
    )
  }

  // Pendiente = mostrar checkboxes
  return (
    <div className="flex items-center gap-4">
      <label className="flex items-center gap-1.5 cursor-pointer group" onClick={() => !loading && handleAsistio(true)}>
        <div className="w-4 h-4 border-2 border-gray-300 rounded group-hover:border-green-500 transition flex-shrink-0" />
        <span className="text-xs text-gray-500 group-hover:text-gray-700 transition select-none">Asistió</span>
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer group" onClick={() => !loading && handleAsistio(false)}>
        <div className="w-4 h-4 border-2 border-gray-300 rounded group-hover:border-red-400 transition flex-shrink-0" />
        <span className="text-xs text-gray-500 group-hover:text-gray-700 transition select-none">No asistió</span>
      </label>
    </div>
  )
}

// ─── Filtros dropdown ─────────────────────────────────────────────────────────
function FiltroDropdown({ label, value, onChange, options }: {
  label:    string
  value:    string
  onChange: (v: string) => void
  options?: string[]
}) {
  if (options) {
    return (
      <select
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 outline-none bg-white focus:border-indigo-400 appearance-none cursor-pointer"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">{label}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  return (
    <input
      placeholder={label}
      className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 outline-none bg-white focus:border-indigo-400 w-24"
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ReservasTabla({ reservas, onRefresh }: { reservas: Reserva[]; onRefresh: () => void }) {
  const [tab,       setTab]       = useState<Tab>('activas')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [pagina,    setPagina]    = useState(1)
  const [menuOpen,  setMenuOpen]  = useState<string | null>(null)
  const [orden,     setOrden]     = useState<{ col: string; dir: 'asc'|'desc' }>({ col: '', dir: 'asc' })
  const [filtros,   setFiltros]   = useState({ sucursal: '', clase: '', fecha: '', hora: '', estado: '' })

  // ── Filtrar por tab ──────────────────────────────────────────────────────────
  const porTab = reservas.filter(r => {
    if (tab === 'activas')       return r.estatus !== 'Cancelada' && !r.lista_espera
    if (tab === 'cancelaciones') return r.estatus === 'Cancelada'
    if (tab === 'no-shows')      return r.lista_espera
    return true
  })

  // ── Filtros ──────────────────────────────────────────────────────────────────
  const filtradas = porTab.filter(r => {
    const suc   = r.clases?.sucursales?.nombre?.toLowerCase() || ''
    const clase = r.clases?.nombre_clase?.toLowerCase() || ''
    const fecha = r.clases?.horario?.slice(0, 10) || ''
    return (
      (!filtros.sucursal || suc.includes(filtros.sucursal.toLowerCase()))  &&
      (!filtros.clase    || clase.includes(filtros.clase.toLowerCase()))   &&
      (!filtros.fecha    || fecha === filtros.fecha)                        &&
      (!filtros.estado   || r.estatus === filtros.estado)
    )
  })

  // ── Ordenar ──────────────────────────────────────────────────────────────────
  const ordenadas = [...filtradas].sort((a, b) => {
    if (!orden.col) return 0
    const va = orden.col === 'Cliente' ? a.clientes?.nombre_completo || ''
             : orden.col === 'Clase'   ? a.clases?.nombre_clase || ''
             : a.clases?.horario || ''
    const vb = orden.col === 'Cliente' ? b.clientes?.nombre_completo || ''
             : orden.col === 'Clase'   ? b.clases?.nombre_clase || ''
             : b.clases?.horario || ''
    return orden.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  // ── Paginación ────────────────────────────────────────────────────────────────
  const totalPags = Math.max(Math.ceil(ordenadas.length / POR_PAGINA), 1)
  const paginadas = ordenadas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  // ── Selección ─────────────────────────────────────────────────────────────────
  const toggleAll = () => {
    if (seleccion.size === paginadas.length) setSeleccion(new Set())
    else setSeleccion(new Set(paginadas.map(r => r.id)))
  }
  const toggleOne = (id: string) => {
    const s = new Set(seleccion)
    s.has(id) ? s.delete(id) : s.add(id)
    setSeleccion(s)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const setFiltro = (key: string, val: string) => { setFiltros(p => ({ ...p, [key]: val })); setPagina(1) }
  const limpiar   = () => { setFiltros({ sucursal:'', clase:'', fecha:'', hora:'', estado:'' }); setPagina(1) }
  const toggleOrden = (col: string) => setOrden(o => ({ col, dir: o.col === col && o.dir === 'asc' ? 'desc' : 'asc' }))
  const sortIcon  = (col: string) => <span className="text-gray-300 ml-0.5">{orden.col === col ? (orden.dir === 'asc' ? '↑' : '↓') : '↕'}</span>

  const tiempoRelativo = (fecha: string) => {
    const diff = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000)
    if (diff < 60)   return `Hace ${diff} min`
    if (diff < 1440) return `Hace ${Math.floor(diff/60)} hr`
    return `Hace ${Math.floor(diff/1440)} días`
  }

  const hayFiltros = Object.values(filtros).some(v => v !== '')

  // ── Acciones ──────────────────────────────────────────────────────────────────
  const cancelarReserva = async (r: Reserva) => {
    await supabase.from('reservas').update({ estatus: 'Cancelada' }).eq('id', r.id)
    const { data: enEspera } = await supabase.from('reservas').select('*')
      .eq('clase_id', r.clases?.id).eq('lista_espera', true).eq('estatus', 'Pendiente')
      .order('created_at', { ascending: true }).limit(1)
    if (enEspera?.length) await supabase.from('reservas').update({ lista_espera: false, estatus: 'Confirmada' }).eq('id', enEspera[0].id)
    onRefresh(); setMenuOpen(null)
  }

  const confirmarReserva = async (id: string) => {
    await supabase.from('reservas').update({ estatus: 'Confirmada' }).eq('id', id)
    onRefresh(); setMenuOpen(null)
  }

  // Sucursales únicas para el filtro
  const sucursalesUnicas = [...new Set(reservas.map(r => r.clases?.sucursales?.nombre).filter(Boolean))] as string[]
  const estadosUnicos    = ['Confirmada', 'Pendiente', 'Cancelada']

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => { setTab(t.key); setPagina(1); setSeleccion(new Set()) }}
            className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition border-b-2 ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {t.icon} {t.label}
            {tab === t.key && filtradas.length > 0 && (
              <span className="bg-indigo-100 text-indigo-600 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                {filtradas.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bulk actions bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <span className="text-xs text-gray-500 font-medium">
          {filtradas.length} {tab === 'activas' ? 'Reservas activas' : tab === 'cancelaciones' ? 'Cancelaciones' : 'No-Shows'}
          {seleccion.size > 0 && <span className="text-indigo-600 font-bold ml-1">({seleccion.size} seleccionadas)</span>}
        </span>
        {seleccion.size > 0 && (
          <div className="flex items-center gap-2">
            {tab === 'activas' && <>
              <button className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition">
                <Calendar size={12}/> Reagendar
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition">
                <XIcon size={12}/> Cancelar reserva
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition">
                <XIcon size={12}/> No asistió
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition">
                <Check size={12}/> Confirmar asistencia
              </button>
            </>}
            {tab === 'cancelaciones' && <>
              <button className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition">
                Responder
              </button>
              <button onClick={() => seleccion.forEach(id => confirmarReserva(id))}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition">
                Deshacer cancelación
              </button>
            </>}
            {tab === 'no-shows' && <>
              <button className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition">
                Responder
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition">
                Penalizar
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition">
                Perdonar penalización
              </button>
            </>}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
        <FiltroDropdown label="Sucursal" value={filtros.sucursal} onChange={v => setFiltro('sucursal', v)} options={sucursalesUnicas} />
        <FiltroDropdown label="Clase"    value={filtros.clase}    onChange={v => setFiltro('clase', v)} />
        <div className="flex items-center border border-gray-200 rounded-lg px-3 py-1.5 gap-2 bg-white">
          <Calendar size={12} className="text-gray-400"/>
          <input type="date" className="text-xs text-gray-600 outline-none bg-transparent"
            value={filtros.fecha} onChange={e => setFiltro('fecha', e.target.value)} />
        </div>
        <div className="flex items-center border border-gray-200 rounded-lg px-3 py-1.5 gap-2 bg-white">
          <Clock size={12} className="text-gray-400"/>
          <input type="time" className="text-xs text-gray-600 outline-none bg-transparent"
            value={filtros.hora} onChange={e => setFiltro('hora', e.target.value)} />
        </div>
        <FiltroDropdown label="Estado" value={filtros.estado} onChange={v => setFiltro('estado', v)} options={estadosUnicos} />
        {hayFiltros && (
          <button onClick={limpiar} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition px-2 py-1.5 rounded-lg hover:bg-gray-100">
            <RotateCcw size={11}/> Eliminar filtros
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto overflow-visible relative">
        <table className="w-full text-left">
          <thead className="text-gray-400 text-[11px] font-bold uppercase border-b border-gray-100 bg-white">
            <tr>
              <th className="px-4 py-3 w-8">
                <input type="checkbox"
                  checked={seleccion.size === paginadas.length && paginadas.length > 0}
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('Cliente')}>
                Cliente {sortIcon('Cliente')}
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('Sucursal')}>
                Sucursal {sortIcon('Sucursal')}
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('Clase')}>
                Clase {sortIcon('Clase')}
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('Fecha')}>
                Fecha {sortIcon('Fecha')}
              </th>
              <th className="px-4 py-3">Hora</th>

              {tab === 'activas' && <>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Asistencia</th>
              </>}
              {tab === 'cancelaciones' && <>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Impacto</th>
                <th className="px-4 py-3">Tiempo</th>
              </>}
              {tab === 'no-shows' && <>
                <th className="px-4 py-3">Penalización</th>
                <th className="px-4 py-3">Reincidencia</th>
                <th className="px-4 py-3">Tiempo</th>
              </>}
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paginadas.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-gray-400 italic text-sm">
                  No hay {tab === 'activas' ? 'reservas activas' : tab === 'cancelaciones' ? 'cancelaciones' : 'no-shows'}
                </td>
              </tr>
            ) : paginadas.map(r => (
              <tr key={r.id} className={`transition hover:bg-gray-50 ${seleccion.has(r.id) ? 'bg-indigo-50/50' : ''}`}>

                {/* Checkbox */}
                <td className="px-4 py-3">
                  <input type="checkbox" checked={seleccion.has(r.id)} onChange={() => toggleOne(r.id)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                </td>

                {/* Cliente */}
                <td className="px-4 py-3 min-w-[180px]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 flex-shrink-0">
                      {r.clientes?.nombre_completo?.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0">
                      <Link href={`/dashboard/clientes/${r.clientes?.id}`}
                        className="text-sm font-semibold text-gray-900 hover:text-indigo-600 transition truncate block">
                        {r.clientes?.nombre_completo}
                      </Link>
                      <p className="text-[11px] text-gray-400 truncate">{r.clientes?.email}</p>
                    </div>
                  </div>
                </td>

                {/* Sucursal */}
                <td className="px-4 py-3">
                  <BadgeSucursal nombre={r.clases?.sucursales?.nombre || '—'} />
                </td>

                {/* Clase */}
                <td className="px-4 py-3 text-sm text-gray-700 font-medium">
                  {r.clases?.nombre_clase || '—'}
                </td>

                {/* Fecha */}
                <td className="px-4 py-3 text-sm text-gray-600">
                  {r.clases?.horario
                    ? new Date(r.clases.horario).toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\//g,'-')
                    : '—'}
                </td>

                {/* Hora */}
                <td className="px-4 py-3">
                  <div>
                    <p className="text-sm text-gray-700 font-medium">
                      {r.clases?.horario
                        ? new Date(r.clases.horario).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', hour12: false })
                        : '—'}
                    </p>
                    <p className="text-[11px] text-gray-400">{tiempoRelativo(r.created_at)}</p>
                  </div>
                </td>

                {/* Columnas por tab */}
                {tab === 'activas' && <>
                  <td className="px-4 py-3"><BadgeEstatus estatus={r.estatus} /></td>
                  <td className="px-4 py-3">
                    <AsistenciaCheck
                      reservaId={r.id}
                      estatus={r.estatus}
                      onUpdate={onRefresh}
                    />
                  </td>
                </>}

                {tab === 'cancelaciones' && <>
                  <td className="px-4 py-3"><BadgeTipo    tipo={r.tipo_llegada} /></td>
                  <td className="px-4 py-3"><BadgeImpacto impacto={r.impacto}   /></td>
                  <td className="px-4 py-3 text-[11px] text-gray-400">{tiempoRelativo(r.created_at)}</td>
                </>}

                {tab === 'no-shows' && <>
                  <td className="px-4 py-3"><BadgePenalizacion estado={r.penalizacion} /></td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.reincidencia || 0} {r.reincidencia === 1 ? 'vez' : 'veces'}</td>
                  <td className="px-4 py-3 text-[11px] text-gray-400">{tiempoRelativo(r.created_at)}</td>
                </>}

                {/* Menú ··· */}
                <td className="px-4 py-3 relative">
                  <button onClick={() => setMenuOpen(menuOpen === r.id ? null : r.id)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-400 hover:text-gray-700">
                    <MoreHorizontal size={15}/>
                  </button>
                  {menuOpen === r.id && (
                    <div className="absolute right-8 top-8 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 py-2 min-w-[200px]">
                      <button className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition w-full text-left">
                        <MessageSquare size={15} className="text-gray-400"/> Contactar
                      </button>
                      <button className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition w-full text-left">
                        <Calendar size={15} className="text-gray-400"/> Reagendar
                      </button>
                      {r.estatus !== 'Cancelada' && (
                        <button onClick={() => cancelarReserva(r)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition w-full text-left">
                          <XCircle size={15} className="text-gray-400"/> Cancelar reserva
                        </button>
                      )}
                      {r.estatus === 'Cancelada' && (
                        <button onClick={() => confirmarReserva(r.id)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-green-600 hover:bg-green-50 transition w-full text-left">
                          <RotateCcw size={15} className="text-green-400"/> Reactivar reserva
                        </button>
                      )}
                      <button onClick={() => setMenuOpen(null)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition w-full text-left">
                        <Eye size={15} className="text-gray-400"/>
                        <Link href={`/dashboard/clientes/${r.clientes?.id}`} className="w-full">
                          Ver detalle de cliente
                        </Link>
                      </button>
                    </div>
                  )}
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
            <ChevronLeft size={16}/>
          </button>
          {Array.from({ length: Math.min(totalPags, 5) }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => setPagina(n)}
              className={`w-7 h-7 rounded-lg text-xs font-bold transition ${pagina === n ? 'bg-indigo-600 text-white' : 'hover:bg-gray-100 text-gray-500'}`}>
              {n}
            </button>
          ))}
          {totalPags > 5 && <>
            <span className="text-gray-400 text-xs px-1">...</span>
            <button onClick={() => setPagina(totalPags)}
              className={`w-7 h-7 rounded-lg text-xs font-bold transition ${pagina === totalPags ? 'bg-indigo-600 text-white' : 'hover:bg-gray-100 text-gray-500'}`}>
              {totalPags}
            </button>
          </>}
          <button onClick={() => setPagina(p => Math.min(totalPags, p+1))} disabled={pagina === totalPags}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-30 transition">
            <ChevronRight size={16}/>
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Resultados por página <span className="font-bold text-gray-600">{POR_PAGINA}</span>
        </p>
      </div>
    </div>
  )
}