'use client'
import { useState } from 'react'
import { ChevronRight, ChevronLeft, ChevronRight as ChevronR } from 'lucide-react'
import PaquetesFilters from './PaquetesFilters'

interface Paquete {
  id:              string
  nombre:          string
  precio:          number
  duracion:        number
  estatus:         string
  created_at:      string
  serie_id:        string | null
  renovacion:      string | null
  visible_en_app?: boolean
  series_paquetes?: { nombre: string; color: string }
  paquete_precios?: { activo: boolean; precio_app: number; sucursales: { nombre: string; color: string } }[]
  paquete_verticales?: { verticales: { nombre: string; color: string } }[]
  _vendidos?:      number
  _ingresos?:      number
}

interface Props {
  paquetes:   Paquete[]
  series:     { id: string; nombre: string; color: string }[]
  sucursales: { id: string; nombre: string }[]
  verticales: { id: string; nombre: string }[]
  onVer:      (p: Paquete) => void
  onNuevo:    () => void
  onToggleVisibilidad: (id: string, visible: boolean) => void
}

type TabEstatus = 'Activo' | 'Borrador' | 'Pausado' | 'Archivado'
const POR_PAGINA = 15

function hexSoftBg(hex: string) {
  if (!hex || hex.length < 7) return '#f3f4f6'
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},0.12)`
}

function BadgeSerie({ nombre, color }: { nombre: string; color: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold"
      style={{ color, backgroundColor: hexSoftBg(color) }}>
      {nombre}
    </span>
  )
}

export default function PaquetesTabla({ paquetes, series, sucursales, verticales, onVer, onNuevo, onToggleVisibilidad }: Props) {
  const [tab,     setTab]     = useState<TabEstatus>('Activo')
  const [pagina,  setPagina]  = useState(1)
  const [filtros, setFiltros] = useState({ sucursal: '', serie: '', vertical: '', modalidad: '' })
  const [orden,   setOrden]   = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: '', dir: 'asc' })

  const TABS: { key: TabEstatus; label: string }[] = [
    { key: 'Activo',    label: 'Paquetes activos' },
    { key: 'Borrador',  label: 'Borradores' },
    { key: 'Pausado',   label: 'Pausados' },
    { key: 'Archivado', label: 'Archivados' },
  ]

  const setFiltro = (k: string, v: string) => { setFiltros(p => ({ ...p, [k]: v })); setPagina(1) }
  const limpiar   = () => { setFiltros({ sucursal: '', serie: '', vertical: '', modalidad: '' }); setPagina(1) }

  const toggleOrden = (col: string) =>
    setOrden(o => ({ col, dir: o.col === col && o.dir === 'asc' ? 'desc' : 'asc' }))
  const sortIcon = (col: string) =>
    <span className="text-gray-300 ml-0.5 text-[10px]">{orden.col === col ? (orden.dir === 'asc' ? '↑' : '↓') : '↕'}</span>

  // Filtrar por tab
  const porTab = paquetes.filter(p => p.estatus === tab)

  // Filtrar
  const filtrados = porTab.filter(p => {
    const matchSerie    = !filtros.serie    || p.serie_id === filtros.serie
    const matchSucursal = !filtros.sucursal || p.paquete_precios?.some(pp => pp.sucursales?.nombre && pp.activo)
    const matchVertical = !filtros.vertical || p.paquete_verticales?.some(pv => pv.verticales?.nombre === filtros.vertical)
    const matchModalidad = !filtros.modalidad || p.renovacion === filtros.modalidad
    return matchSerie && matchSucursal && matchVertical && matchModalidad
  })

  // Ordenar
  const ordenados = [...filtrados].sort((a, b) => {
    if (!orden.col) return 0
    const map: Record<string, [any, any]> = {
      nombre:   [a.nombre, b.nombre],
      precio:   [a.precio || 0, b.precio || 0],
      vendidos: [a._vendidos || 0, b._vendidos || 0],
      ingresos: [a._ingresos || 0, b._ingresos || 0],
    }
    const [va, vb] = map[orden.col] || ['', '']
    if (typeof va === 'number') return orden.dir === 'asc' ? va - vb : vb - va
    return orden.dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
  })

  const totalPags = Math.max(Math.ceil(ordenados.length / POR_PAGINA), 1)
  const paginados = ordenados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  const conteo = (estatus: TabEstatus) => paquetes.filter(p => p.estatus === estatus).length

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

      {/* Tabs */}
      <div className="grid grid-cols-4 border-b border-gray-100">
        {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setPagina(1) }}
            className={`flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-medium transition border-b-2 ${
                tab === t.key
                ? 'border-gray-900 text-gray-900 font-bold'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}>
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                tab === t.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
            }`}>
                {conteo(t.key)}
            </span>
            </button>
        ))}
       </div>

      {/* Contador + Filtros */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-gray-500 font-medium">{filtrados.length} Paquetes</span>
        <PaquetesFilters
          filtros={filtros}
          series={series}
          sucursales={sucursales}
          verticales={verticales}
          onChange={setFiltro}
          onLimpiar={limpiar}
        />
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-gray-400 text-[11px] font-bold uppercase border-b border-gray-100 bg-white">
            <tr>
                <th className="px-5 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('nombre')}>
                    Paquetes {sortIcon('nombre')}
                </th>
                <th className="px-5 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('serie')}>
                    Serie {sortIcon('serie')}
                </th>
                <th className="px-5 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('sucursales')}>
                    Sucursales activas {sortIcon('sucursales')}
                </th>
                <th className="px-5 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('precio')}>
                    <p>Precio {sortIcon('precio')}</p>
                <p className="text-[10px] font-bold text-gray-300 uppercase normal-case">Tipo</p>
                </th>
                <th className="px-5 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('vigencia')}>
                    <p>Vigencia {sortIcon('vigencia')}</p>
                <p className="text-[10px] font-bold text-gray-300 uppercase normal-case">Días</p>
                </th>
                <th className="px-5 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('vendidos')}>
                    Vendidos {sortIcon('vendidos')}
                </th>
                <th className="px-5 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleOrden('ingresos')}>
                    <p>Ingresos {sortIcon('ingresos')}</p>
                <p className="text-[10px] font-bold text-gray-300 uppercase normal-case">Este mes</p>
                </th>
                <th className="px-5 py-3 text-center">
                  Activo/Inactivo
                </th>
                <th className="px-5 py-3 w-8" />
            </tr>
            </thead>
          <tbody className="divide-y divide-gray-50">
            {paginados.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-gray-400 italic text-sm">
                  No hay paquetes
                </td>
              </tr>
            ) : paginados.map(p => {
              const sucursalesActivas = p.paquete_precios?.filter(pp => pp.activo) || []
              const precioMin = sucursalesActivas.length > 0
                ? Math.min(...sucursalesActivas.map(pp => pp.precio_app || 0))
                : p.precio || 0
              const precioMax = sucursalesActivas.length > 0
                ? Math.max(...sucursalesActivas.map(pp => pp.precio_app || 0))
                : p.precio || 0

              return (
                <tr key={p.id} className="hover:bg-gray-50 transition">

                  {/* Paquete */}
                  <td className="px-5 py-3.5 min-w-[220px]">
                    <button onClick={() => onVer(p)}
                      className="text-sm font-bold text-gray-900 hover:text-indigo-600 transition text-left block">
                      {p.nombre}
                    </button>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {p.renovacion === 'Automatica' ? 'Renovación automática' : 'Sin renovación'}
                    </p>
                  </td>

                  {/* Serie */}
                  <td className="px-5 py-3.5">
                    {p.series_paquetes
                      ? <BadgeSerie nombre={p.series_paquetes.nombre} color={p.series_paquetes.color} />
                      : <span className="text-xs text-gray-300">—</span>
                    }
                  </td>

                  {/* Sucursales activas */}
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {sucursalesActivas.length > 0
                        ? sucursalesActivas.map((pp, i) => {
                            const color = pp.sucursales?.color || '#6b7280'
                            return (
                                <span key={i}
                                className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                                style={{ color, backgroundColor: hexSoftBg(color) }}>
                                {pp.sucursales?.nombre}
                                </span>
                            )
                            })
                        : <span className="text-xs text-gray-300">—</span>
                        }
                    </div>
                  </td>

                  {/* Precio */}
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-bold text-gray-900">
                      {precioMin === precioMax
                        ? `$${precioMin.toLocaleString()}`
                        : `$${precioMin.toLocaleString()} – $${precioMax.toLocaleString()}`
                      }
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {sucursalesActivas.length > 0 ? `terminal $${(precioMin + 200).toLocaleString()}` : ''}
                    </p>
                  </td>

                  {/* Vigencia */}
                  <td className="px-5 py-3.5 text-sm text-gray-700">
                    {p.duracion ? `${p.duracion} días` : '—'}
                  </td>

                  {/* Vendidos */}
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-bold text-gray-900">{p._vendidos ?? '—'}</p>
                    {p._vendidos && <p className="text-[11px] text-gray-400">42 renos</p>}
                  </td>

                  {/* Ingresos */}
                  <td className="px-5 py-3.5 text-sm font-bold text-gray-900">
                    {p._ingresos ? `$${p._ingresos.toLocaleString()}` : '—'}
                  </td>

                  <td className="px-5 py-3.5 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleVisibilidad(p.id, p.visible_en_app !== false ? false : true)
                      }}
                      className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                        p.visible_en_app !== false ? 'bg-emerald-500' : 'bg-gray-200'
                      }`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
                        p.visible_en_app !== false ? 'translate-x-6' : 'translate-x-0'
                      }`} />
                    </button>
                  </td>
                  
                  {/* Flecha */}
                  <td className="px-5 py-3.5">
                    <button onClick={() => onVer(p)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-indigo-600 transition">
                      <ChevronRight size={15} />
                    </button>
                  </td>
                </tr>
              )
            })}
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