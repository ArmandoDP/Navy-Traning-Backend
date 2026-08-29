'use client'
import { RotateCcw } from 'lucide-react'

interface Props {
  filtros:  { nombre: string; sucursal: string; plan: string; fecha: string; estado: string }
  onChange: (k: string, v: string) => void
  onLimpiar: () => void
}

function FiltroInput({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input placeholder={placeholder}
      className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 outline-none focus:border-indigo-400 bg-white transition min-w-[90px]"
      value={value} onChange={e => onChange(e.target.value)} />
  )
}

function FiltroSelect({ placeholder, value, options, onChange }: {
  placeholder: string; value: string; options: string[]; onChange: (v: string) => void
}) {
  return (
    <div className="relative">
      <select className="appearance-none border border-gray-200 rounded-lg pl-3 pr-7 py-1.5 text-xs text-gray-600 outline-none focus:border-indigo-400 bg-white cursor-pointer min-w-[90px]"
        value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
    </div>
  )
}

export default function ClientesFilters({ filtros, onChange, onLimpiar }: Props) {
  const hay = Object.values(filtros).some(v => v !== '')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FiltroInput    placeholder="Nombre"   value={filtros.nombre}   onChange={v => onChange('nombre', v)} />
      <FiltroInput    placeholder="Sucursal" value={filtros.sucursal} onChange={v => onChange('sucursal', v)} />
      <FiltroInput    placeholder="Plan"     value={filtros.plan}     onChange={v => onChange('plan', v)} />
      <div className="flex items-center border border-gray-200 rounded-lg px-2.5 py-1.5 gap-1.5 bg-white">
        <span className="text-gray-400 text-xs">📅</span>
        <input type="date" className="text-xs text-gray-600 outline-none bg-transparent"
          value={filtros.fecha} onChange={e => onChange('fecha', e.target.value)} />
      </div>
      <FiltroSelect placeholder="Estado" value={filtros.estado}
        options={['Activo','Expirado','Pago fallido','Perdido','Inactivo']}
        onChange={v => onChange('estado', v)} />
      {hay && (
        <button onClick={onLimpiar}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition px-2 py-1.5 rounded-lg hover:bg-gray-100">
          <RotateCcw size={11}/> Eliminar filtros
        </button>
      )}
    </div>
  )
}