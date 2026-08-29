'use client'
import { Search, SlidersHorizontal } from 'lucide-react'

interface Filtros {
  nombre:   string
  tipo:     string
  sucursal: string
  estatus:  string
}

interface Props {
  filtros:   Filtros
  onChange:  (k: string, v: string) => void
  onLimpiar: () => void
}

const inputCls  = "border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 bg-gray-50 transition placeholder:text-gray-400 h-9"
const selectCls = `${inputCls} appearance-none cursor-pointer pr-7`

const TIPOS = ['Coach', 'Manager', 'Submanager', 'Regional', 'Front', 'Staff general']

export default function StaffFilters({ filtros, onChange, onLimpiar }: Props) {
  const hayFiltros = Object.values(filtros).some(v => v !== '')

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Buscador */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          placeholder="Buscar..."
          className={`${inputCls} pl-8 w-52`}
          value={filtros.nombre}
          onChange={e => onChange('nombre', e.target.value)}
        />
      </div>

      {/* Tipo */}
      <div className="relative">
        <select className={`${selectCls} w-40`} value={filtros.tipo} onChange={e => onChange('tipo', e.target.value)}>
          <option value="">Tipo de miembro</option>
          {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
      </div>

      {/* Estatus */}
      <div className="relative">
        <select className={`${selectCls} w-32`} value={filtros.estatus} onChange={e => onChange('estatus', e.target.value)}>
          <option value="">Estatus</option>
          <option value="Activo">Activo</option>
          <option value="Inactivo">Inactivo</option>
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
      </div>

      {/* Limpiar */}
      {hayFiltros && (
        <button onClick={onLimpiar}
          className="text-xs text-gray-400 hover:text-gray-700 transition font-medium px-2 py-1 rounded-lg hover:bg-gray-100">
          Limpiar
        </button>
      )}
    </div>
  )
}