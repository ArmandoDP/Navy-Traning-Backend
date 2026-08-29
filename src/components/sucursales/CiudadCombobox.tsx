'use client'
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X } from 'lucide-react'

const CIUDADES_MX = [
  'CDMX', 'Guadalajara', 'Monterrey', 'Puebla', 'Querétaro',
  'Tijuana', 'León', 'Juárez', 'Mérida', 'San Luis Potosí',
  'Aguascalientes', 'Hermosillo', 'Morelia', 'Saltillo', 'Veracruz',
  'Culiacán', 'Cancún', 'Chihuahua', 'Tlaxcala', 'Oaxaca',
  'Toluca', 'Torreón', 'Xalapa', 'Acapulco', 'Mexicali',
]

interface Props {
  value: string
  onChange: (val: string) => void
  required?: boolean
}

const inputCls = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 bg-gray-50 transition placeholder:text-gray-400'

export default function CiudadCombobox({ value, onChange, required }: Props) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState(value)
  const ref               = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        if (query !== value) onChange(query)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [query, value, onChange])

  const filtradas = CIUDADES_MX.filter(c => c.toLowerCase().includes(query.toLowerCase()))

  const handleSelect = (ciudad: string) => {
    setQuery(ciudad)
    onChange(ciudad)
    setOpen(false)
  }

  const handleClear = () => {
    setQuery('')
    onChange('')
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          className={inputCls}
          placeholder="Seleccionar o escribir"
          value={query}
          required={required}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && (
            <button type="button" onClick={handleClear} className="text-gray-400 hover:text-gray-600 transition">
              <X size={13} />
            </button>
          )}
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {open && filtradas.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto py-1">
          {filtradas.map(ciudad => (
            <li
              key={ciudad}
              onMouseDown={() => handleSelect(ciudad)}
              className={`px-4 py-2 text-sm cursor-pointer transition hover:bg-gray-50 ${
                ciudad === value ? 'font-semibold text-gray-900 bg-gray-50' : 'text-gray-700'
              }`}
            >
              {ciudad}
            </li>
          ))}
          {query && !CIUDADES_MX.some(c => c.toLowerCase() === query.toLowerCase()) && (
            <li
              onMouseDown={() => handleSelect(query)}
              className="px-4 py-2 text-sm cursor-pointer text-gray-500 italic hover:bg-gray-50 border-t border-gray-100"
            >
              Usar "{query}"
            </li>
          )}
        </ul>
      )}
    </div>
  )
}