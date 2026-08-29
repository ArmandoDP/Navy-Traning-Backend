'use client'
import { useEffect, useState } from 'react'
import { supabase }            from '@/lib/supabase'

interface Sucursal {
  id:     string
  nombre: string
  color:  string
}

interface PrecioSucursal {
  sucursal_id:  string
  activo:       boolean
  precio_app:   string
  activo_desde: string
}

interface Room {
  id:       string
  nombre:   string
  capacidad:number
}

interface Props {
  sucursales:       Sucursal[]
  precios:          PrecioSucursal[]
  roomsSelected:    string[]
  accesosSucursales: string[]  // ← agrega
  onChange:         (sucursalId: string, campo: string, valor: any) => void
  onRoomToggle:     (roomId: string) => void
  onAccesoToggle:   (sucursalId: string) => void  // ← agrega
}

function hexSoftBg(hex: string) {
  if (!hex || hex.length < 7) return '#f3f4f6'
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},0.12)`
}

const inputCls = "border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 bg-gray-50 transition placeholder:text-gray-400 w-full"

export default function TabSucursalesYPrecio({ sucursales, precios, roomsSelected, onChange, onRoomToggle, onAccesoToggle, accesosSucursales }: Props) {
  const [roomsPorSucursal, setRoomsPorSucursal] = useState<Record<string, Room[]>>({})

  // Cargar rooms de cada sucursal activa
  useEffect(() => {
    const sucursalesActivas = sucursales.filter(s =>
      precios.find(p => p.sucursal_id === s.id)?.activo
    )
    if (sucursalesActivas.length === 0) return

    Promise.all(
      sucursalesActivas.map(s =>
        supabase.from('rooms')
          .select('id, nombre, capacidad')
          .eq('sucursal_id', s.id)
          .eq('estatus', 'Activo')
          .then(({ data }) => ({ sucursalId: s.id, rooms: data || [] }))
      )
    ).then(results => {
      const mapa: Record<string, Room[]> = {}
      results.forEach(r => { mapa[r.sucursalId] = r.rooms })
      setRoomsPorSucursal(mapa)
    })
  }, [precios, sucursales])

  const getPrecio = (sucursalId: string) =>
    precios.find(p => p.sucursal_id === sucursalId) || {
      sucursal_id: sucursalId, activo: false, precio_app: '', activo_desde: ''
    }

  return (
    <div className="px-6 py-5 space-y-4">
      {sucursales.map(s => {
        const precio = getPrecio(s.id)
        const rooms  = roomsPorSucursal[s.id] || []

        return (
          <div key={s.id} className={`border rounded-2xl overflow-hidden transition ${
            precio.activo ? 'border-gray-200' : 'border-gray-100 opacity-70'
          }`}>

            {/* Header sucursal */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
              <div className="flex items-center gap-2.5">
                <div
                  onClick={() => onChange(s.id, 'activo', !precio.activo)}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                    precio.activo ? 'bg-emerald-500' : 'bg-gray-200'
                  }`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    precio.activo ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </div>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color || '#6b7280' }} />
                <span className="text-sm font-bold text-gray-800">{s.nombre}</span>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded"
                style={{ color: s.color, backgroundColor: hexSoftBg(s.color) }}>
                Studio + Gym
              </span>
            </div>

            {/* Campos precio + Rooms */}
            {precio.activo && (
              <div className="px-4 py-4 space-y-4">

                {/* Precio */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500">Precio App*</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input type="number" placeholder="Precio app" className={`${inputCls} pl-6`}
                        value={precio.precio_app}
                        onChange={e => onChange(s.id, 'precio_app', e.target.value)} />
                    </div>
                    <p className="text-[11px] text-gray-400">Suscripción</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500">Activo desde*</label>
                    <input type="date" className={inputCls}
                      value={precio.activo_desde}
                      onChange={e => onChange(s.id, 'activo_desde', e.target.value)} />
                  </div>
                </div>

                {/* Rooms */}
                {rooms.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Rooms incluidos
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {rooms.map(r => {
                        const isSelected = roomsSelected.includes(r.id)
                        return (
                          <button key={r.id} type="button"
                            onClick={() => onRoomToggle(r.id)}
                            className="px-3 py-1.5 rounded-full text-xs font-semibold border transition flex items-center gap-1.5"
                            style={isSelected
                              ? { backgroundColor: s.color, color: '#fff', borderColor: s.color }
                              : { backgroundColor: hexSoftBg(s.color), color: s.color, borderColor: 'transparent' }
                            }>
                            {isSelected && '✓ '}
                            {r.nombre}
                            <span className="opacity-70 text-[10px]">· {r.capacidad} spots</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {precio.activo && rooms.length === 0 && (
                  <p className="text-[11px] text-gray-300 italic">
                    Sin rooms creados en esta sucursal
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
      {/* Accesos a sucursales */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-800">Accesos a sucursales</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Sucursales donde el cliente puede hacer check-in y reservar clases, independiente de donde compró
          </p>
        </div>
        <div className="px-4 py-4 flex flex-wrap gap-2">
          {sucursales.map(s => {
            const tieneAcceso = accesosSucursales.includes(s.id)
            return (
              <button key={s.id} type="button"
                onClick={() => onAccesoToggle(s.id)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border transition flex items-center gap-1.5"
                style={tieneAcceso
                  ? { backgroundColor: s.color, color: '#fff', borderColor: s.color }
                  : { backgroundColor: hexSoftBg(s.color), color: s.color, borderColor: 'transparent' }
                }>
                {tieneAcceso && '✓ '}
                {s.nombre}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}