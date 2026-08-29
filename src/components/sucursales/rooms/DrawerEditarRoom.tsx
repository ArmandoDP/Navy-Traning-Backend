'use client'
import { useState, useEffect, useRef } from 'react'
import { X, Upload, Trash2 }           from 'lucide-react'
import { supabase }                    from '@/lib/supabase'
import RoomGrid, { CeldaGrid }         from './RoomGrid'
import RoomItemSelector, { ItemType }  from './RoomItemSelector'

interface Props {
  isOpen:     boolean
  room:       any
  onClose:    () => void
  onSuccess:  () => void
}

const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 bg-gray-50 transition placeholder:text-gray-400"

function Popup({ tipo, mensaje, onClose }: { tipo: 'error'|'info'; mensaje: string; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-black/20">
      <div className={`bg-white rounded-2xl shadow-2xl border px-6 py-5 w-full flex flex-col gap-3 ${
        tipo === 'error' ? 'border-red-100' : 'border-amber-100'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0 ${
            tipo === 'error' ? 'bg-red-50' : 'bg-amber-50'
          }`}>
            {tipo === 'error' ? '⚠️' : 'ℹ️'}
          </div>
          <div>
            <p className="text-sm font-black text-gray-900">
              {tipo === 'error' ? 'No se puede realizar esta acción' : 'Atención'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{mensaje}</p>
          </div>
        </div>
        <button onClick={onClose}
          className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition"
          style={{ backgroundColor: tipo === 'error' ? '#ef4444' : '#f59e0b' }}>
          Entendido
        </button>
      </div>
    </div>
  )
}

export default function DrawerEditarRoom({ isOpen, room, onClose, onSuccess }: Props) {
  const [loading,      setLoading]      = useState(false)
  const [nombre,       setNombre]       = useState('')
  const [descripcion,  setDescripcion]  = useState('')
  const [capacidad,    setCapacidad]    = useState(0)
  const [ancho,        setAncho]        = useState(0)
  const [alto,         setAlto]         = useState(0)
  const [zoom,         setZoom]         = useState(100)
  const [celdas,       setCeldas]       = useState<CeldaGrid[]>([])
  const [itemSelected, setItemSelected] = useState<ItemType>(null)
  const [popup,        setPopup]        = useState<{ tipo: 'error'|'info'; mensaje: string } | null>(null)
  const [tieneReservas, setTieneReservas] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen || !room) return

    setNombre(room.nombre || '')
    setDescripcion(room.descripcion || '')
    setCapacidad(room.capacidad || 0)
    setAncho(room.ancho || 0)
    setAlto(room.alto || 0)
    setZoom(100)
    setCeldas(room.layout || [])
    setItemSelected(null)
    setPopup(null)

    // Verificar si hay reservas activas en este room
    supabase.from('reservas')
      .select('id')
      .eq('room_id', room.id)
      .neq('estatus', 'Cancelada')
      .limit(1)
      .then(({ data }) => setTieneReservas((data?.length || 0) > 0))

  }, [isOpen, room])

  const getNextNumero = (tipo: ItemType): string => {
    if (!tipo || tipo === 'Coach' || tipo === 'Entrada') return ''
    const prefix   = tipo === 'Rack' ? 'R' : 'M'
    const existentes = celdas.filter(c => c.tipo === tipo).length
    return `${prefix}${existentes + 1}`
  }

  const spotsDisponibles = celdas.filter(c =>
    (c.tipo === 'Rack' || c.tipo === 'Mat') && !c.bloqueado
  ).length

  const handleCeldaClick = (fila: number, columna: number) => {
    if (!itemSelected) return

    if (tieneReservas) {
      setPopup({ tipo: 'error', mensaje: 'No se puede modificar el layout porque ya hay clientes con lugares reservados en este room.' })
      return
    }

    const existente = celdas.find(c => c.fila === fila && c.columna === columna)
    if (existente) {
      setCeldas(prev => prev.filter(c => !(c.fila === fila && c.columna === columna)))
      return
    }

    if ((itemSelected === 'Rack' || itemSelected === 'Mat') && spotsDisponibles >= capacidad) {
      setPopup({ tipo: 'info', mensaje: `Ya alcanzaste la capacidad máxima de ${capacidad} spots.` })
      return
    }

    setCeldas(prev => [...prev, {
      fila, columna,
      tipo:      itemSelected,
      numero:    getNextNumero(itemSelected),
      bloqueado: false,
    }])
  }

  const handleCambiarDimension = (dim: 'ancho' | 'alto', valor: number) => {
    if (tieneReservas) {
      setPopup({ tipo: 'error', mensaje: 'No se puede modificar las dimensiones porque ya hay clientes con lugares reservados en este room.' })
      return
    }
    const nuevoValor = Math.max(0, Math.min(20, valor))
    if (dim === 'ancho') setAncho(nuevoValor)
    else setAlto(nuevoValor)
    setCeldas(prev => prev.filter(c =>
      dim === 'ancho' ? c.columna < nuevoValor : c.fila < nuevoValor
    ))
  }

  const handleGuardar = async () => {
    if (!nombre) return
    setLoading(true)

    // Actualizar room
    const { error } = await supabase.from('rooms').update({
      nombre,
      descripcion,
      capacidad,
      ancho,
      alto,
      layout: celdas,
    }).eq('id', room.id)

    if (error) {
      setPopup({ tipo: 'error', mensaje: 'Error al guardar: ' + error.message })
      setLoading(false)
      return
    }

    // Si no hay reservas, actualizar spots
    if (!tieneReservas) {
      await supabase.from('room_spots').delete().eq('room_id', room.id)
      const spots = celdas.filter(c => c.tipo === 'Rack' || c.tipo === 'Mat')
      if (spots.length > 0) {
        await supabase.from('room_spots').insert(
          spots.map(s => ({
            room_id:   room.id,
            numero:    s.numero,
            tipo:      s.tipo,
            fila:      s.fila,
            columna:   s.columna,
            bloqueado: false,
          }))
        )
      }
    }

    setLoading(false)
    onSuccess()
    onClose()
  }

  const handleEliminar = async () => {
    if (tieneReservas) {
      setPopup({ tipo: 'error', mensaje: 'No se puede eliminar este room porque ya hay clientes con lugares reservados.' })
      return
    }

    setLoading(true)
    await supabase.from('room_spots').delete().eq('room_id', room.id)
    await supabase.from('rooms').delete().eq('id', room.id)
    setLoading(false)
    onSuccess()
    onClose()
  }

  if (!isOpen || !room) return null

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-2xl flex flex-col">

        {/* Popup */}
        {popup && <Popup tipo={popup.tipo} mensaje={popup.mensaje} onClose={() => setPopup(null)} />}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-black text-gray-900">Editar room</span>
            <span className="text-gray-300">›</span>
            <span className="text-gray-500">{room.nombre}</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={16} />
          </button>
        </div>

        {/* Aviso si hay reservas */}
        {tieneReservas && (
          <div className="mx-6 mt-4 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700 font-medium">
            ⚠ Este room tiene reservas activas — el layout y dimensiones no se pueden modificar
          </div>
        )}

        {/* Formulario */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Nombre + Capacidad */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Room*</label>
              <input placeholder="Hyrox" className={inputCls}
                value={nombre} onChange={e => setNombre(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Capacidad máxima (SPOTS)*</label>
              <div className="flex items-center border border-gray-200 rounded-xl bg-gray-50 overflow-hidden">
                <button type="button" onClick={() => setCapacidad(p => Math.max(0, p - 1))}
                  className="px-3 py-2.5 text-gray-400 hover:bg-gray-100 transition">−</button>
                <span className="flex-1 text-center text-sm font-bold text-gray-900">{capacidad}</span>
                <button type="button" onClick={() => setCapacidad(p => p + 1)}
                  className="px-3 py-2.5 text-gray-400 hover:bg-gray-100 transition">+</button>
              </div>
            </div>
          </div>

          {/* Selector items */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Seleccionar item*</label>
            <RoomItemSelector selected={itemSelected} onSelect={setItemSelected} />
          </div>

          {/* Controles cuadrícula */}
          <div className="border border-gray-200 rounded-xl px-4 py-3 space-y-3 bg-gray-50">
            <p className="text-xs font-bold text-gray-500">Cuadrícula de {ancho}×{alto}</p>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Ancho:</span>
                <button onClick={() => handleCambiarDimension('ancho', ancho - 1)}
                  className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs bg-white">−</button>
                <span className="w-6 text-center text-sm font-bold text-gray-900">{ancho}</span>
                <button onClick={() => handleCambiarDimension('ancho', ancho + 1)}
                  className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs bg-white">+</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Alto:</span>
                <button onClick={() => handleCambiarDimension('alto', alto - 1)}
                  className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs bg-white">−</button>
                <span className="w-6 text-center text-sm font-bold text-gray-900">{alto}</span>
                <button onClick={() => handleCambiarDimension('alto', alto + 1)}
                  className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs bg-white">+</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Zoom:</span>
                <button onClick={() => setZoom(p => Math.max(50, p - 10))}
                  className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs bg-white">−</button>
                <span className="w-10 text-center text-xs font-bold text-gray-900">{zoom}%</span>
                <button onClick={() => setZoom(p => Math.min(200, p + 10))}
                  className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs bg-white">+</button>
              </div>
            </div>
          </div>

          {/* Mapa */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-700">Mapa de room*</p>
            <p className="text-xs text-gray-400">
              <span className={spotsDisponibles >= capacidad && capacidad > 0 ? 'text-emerald-500 font-bold' : ''}>
                {spotsDisponibles}
              </span>/{capacidad} spots
            </p>
          </div>

          <div className="border border-gray-200 rounded-xl bg-gray-50 min-h-[200px] flex items-center justify-center overflow-auto">
            <RoomGrid
              ancho={ancho}
              alto={alto}
              celdas={celdas}
              itemSelected={tieneReservas ? null : itemSelected}
              zoom={zoom}
              onCeldaClick={handleCeldaClick}
            />
          </div>

          {/* Descripción */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Descripción</label>
            <textarea rows={3} placeholder="Descripción del room..."
              className={`${inputCls} resize-none`}
              value={descripcion} onChange={e => setDescripcion(e.target.value)} />
          </div>

          {/* Eliminar */}
          <button onClick={handleEliminar}
            className="flex items-center gap-2 text-red-500 hover:text-red-600 text-sm font-medium transition pt-2">
            <Trash2 size={15} /> Eliminar room
          </button>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={loading || !nombre}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition"
            style={{ backgroundColor: '#171B24' }}>
            {loading ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </>
  )
}