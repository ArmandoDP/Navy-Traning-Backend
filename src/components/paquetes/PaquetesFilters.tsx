'use client'

interface Filtros {
  sucursal: string
  serie:    string
  vertical: string
  modalidad:string
}

interface Props {
  filtros:    Filtros
  series:     { id: string; nombre: string; color: string }[]
  sucursales: { id: string; nombre: string }[]
  verticales: { id: string; nombre: string }[]
  onChange:   (k: string, v: string) => void
  onLimpiar:  () => void
}

const selectCls = "border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none focus:border-gray-400 bg-white transition appearance-none cursor-pointer h-9 pr-8"

export default function PaquetesFilters({ filtros, series, sucursales, verticales, onChange, onLimpiar }: Props) {
  const hayFiltros = Object.values(filtros).some(v => v !== '')

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Sucursal */}
      <div className="relative">
        <select className={selectCls} value={filtros.sucursal} onChange={e => onChange('sucursal', e.target.value)}>
          <option value="">Sucursal</option>
          {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
      </div>

      {/* Serie */}
      <div className="relative">
        <select className={selectCls} value={filtros.serie} onChange={e => onChange('serie', e.target.value)}>
          <option value="">Serie</option>
          {series.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
      </div>

      {/* Vertical */}
      <div className="relative">
        <select className={selectCls} value={filtros.vertical} onChange={e => onChange('vertical', e.target.value)}>
          <option value="">Vertical</option>
          {verticales.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
      </div>

      {/* Modalidad */}
      <div className="relative">
        <select className={selectCls} value={filtros.modalidad} onChange={e => onChange('modalidad', e.target.value)}>
          <option value="">Modalidad</option>
          <option value="Automatica">Automática</option>
          <option value="Manual">Manual</option>
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
      </div>

      {hayFiltros && (
        <button onClick={onLimpiar}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition font-medium px-2 py-1 rounded-lg hover:bg-gray-100">
          ↺ Eliminar filtros
        </button>
      )}
    </div>
  )
}