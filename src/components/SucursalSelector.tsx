'use client'
import { useState, useRef, useEffect } from 'react'
import { Globe, ChevronDown, MapPin, Check } from 'lucide-react'
import { useSucursal } from '@/context/SucursalContext'

const PALETTE: Record<string, string> = {
  '#6366f1': '#6366f1',
  '#f97316': '#f97316',
  '#22c55e': '#22c55e',
  '#3b82f6': '#3b82f6',
  '#ec4899': '#ec4899',
  '#8b5cf6': '#8b5cf6',
}

export default function SucursalSelector() {
  const { sucursales, sucursalActiva, setSucursalActiva } = useSucursal()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Cerrar al click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const label = sucursalActiva
    ? `${sucursalActiva.nombre}, ${sucursalActiva.ciudad}`
    : 'Global'

  const color = sucursalActiva?.color || '#6366f1'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-700 font-medium transition min-w-[140px]"
      >
        {sucursalActiva
          ? <MapPin size={14} style={{ color }} />
          : <Globe size={14} className="text-gray-400" />
        }
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 min-w-[220px] overflow-hidden py-1">

          {/* Global */}
          <button
            onClick={() => { setSucursalActiva(null); setOpen(false) }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition ${!sucursalActiva ? 'font-bold text-indigo-600' : 'text-gray-700'}`}
          >
            <Globe size={14} className="text-gray-400 flex-shrink-0" />
            <span className="flex-1 text-left">Global</span>
            {!sucursalActiva && <Check size={14} className="text-indigo-600" />}
          </button>

          {sucursales.length > 0 && (
            <div className="border-t border-gray-100 mt-1 pt-1">
              {sucursales.map(s => {
                const c      = s.color || '#6366f1'
                const active = sucursalActiva?.id === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => { setSucursalActiva(s); setOpen(false) }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition ${active ? 'font-bold' : 'text-gray-700'}`}
                  >
                    <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${c}22` }}>
                      <MapPin size={11} style={{ color: c }} />
                    </div>
                    <span className="flex-1 text-left truncate" style={active ? { color: c } : {}}>
                      {s.nombre}, {s.ciudad}
                    </span>
                    {active && <Check size={14} style={{ color: c }} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}