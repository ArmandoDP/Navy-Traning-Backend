'use client'
import { X } from 'lucide-react'

interface Props {
  filtros: {
    sucursal: string
    clase:    string
    fecha:    string
    hora:     string
    estado:   string
  }
  onChange: (key: string, val: string) => void
  onLimpiar: () => void
}

const hayFiltros = (f: Props['filtros']) =>
  Object.values(f).some(v => v !== '')

export default function ReservasFilters({ filtros, onChange, onLimpiar }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
      <input
        placeholder="Sucursal"
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-indigo-400 bg-white w-28 transition"
        value={filtros.sucursal}
        onChange={e => onChange('sucursal', e.target.value)}
      />
      <input
        placeholder="Clase"
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-indigo-400 bg-white w-28 transition"
        value={filtros.clase}
        onChange={e => onChange('clase', e.target.value)}
      />
      <input
        type="date"
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-indigo-400 bg-white transition"
        value={filtros.fecha}
        onChange={e => onChange('fecha', e.target.value)}
      />
      <input
        type="time"
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-indigo-400 bg-white transition"
        value={filtros.hora}
        onChange={e => onChange('hora', e.target.value)}
      />
      <input
        placeholder="Estado"
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-indigo-400 bg-white w-28 transition"
        value={filtros.estado}
        onChange={e => onChange('estado', e.target.value)}
      />
      {hayFiltros(filtros) && (
        <button
          onClick={onLimpiar}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition px-2 py-1.5 rounded-lg hover:bg-gray-100"
        >
          <X size={12}/> Eliminar filtros
        </button>
      )}
    </div>
  )
}