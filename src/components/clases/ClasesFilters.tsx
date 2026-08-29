'use client'
import { Clock, RotateCcw } from 'lucide-react'

interface Props {
  filtros: { hora: string; clase: string; room: string; coach: string; tipo: string; estado: string }
  tiposUnicos:   string[]
  coachesUnicos: string[]
  roomsUnicos:   string[]
  onChange:  (k: string, v: string) => void
  onLimpiar: () => void
}

function Dropdown({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void
}) {
  return (
    <div className="relative">
      <select
        className="appearance-none border border-gray-200 rounded-lg pl-3 pr-7 py-1.5 text-xs text-gray-600 outline-none bg-white focus:border-indigo-400 cursor-pointer min-w-[90px]"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">{label}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">▾</span>
    </div>
  )
}

export default function ClasesFilters({ filtros, tiposUnicos, coachesUnicos, roomsUnicos, onChange, onLimpiar }: Props) {
  const hayFiltros = Object.values(filtros).some(v => v !== '')

  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      {/* Hora */}
      <div className="flex items-center border border-gray-200 rounded-lg px-2.5 py-1.5 gap-1.5 bg-white">
        <Clock size={12} className="text-gray-400"/>
        <input type="time"
          className="text-xs text-gray-600 outline-none bg-transparent w-20"
          value={filtros.hora}
          onChange={e => onChange('hora', e.target.value)}
        />
        <span className="text-gray-300 text-[10px]">▾</span>
      </div>

      <Dropdown label="Clase"  value={filtros.clase}  options={[]} onChange={v => onChange('clase', v)} />
      <Dropdown label="Room"   value={filtros.room}   options={roomsUnicos}   onChange={v => onChange('room', v)} />
      <Dropdown label="Coach"  value={filtros.coach}  options={coachesUnicos} onChange={v => onChange('coach', v)} />
      <Dropdown label="Tipo"   value={filtros.tipo}   options={tiposUnicos}   onChange={v => onChange('tipo', v)} />
      <Dropdown label="Estado" value={filtros.estado} options={['Activa','Cancelada']} onChange={v => onChange('estado', v)} />

      {hayFiltros && (
        <button onClick={onLimpiar}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition px-2 py-1.5 rounded-lg hover:bg-gray-100">
          <RotateCcw size={11}/> Eliminar filtros
        </button>
      )}
    </div>
  )
}