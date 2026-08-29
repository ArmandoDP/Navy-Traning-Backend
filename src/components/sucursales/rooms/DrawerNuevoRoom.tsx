'use client'
import { useState, useRef }          from 'react'
import { X, Minus, Plus, Upload }    from 'lucide-react'
import { supabase }                  from '@/lib/supabase'
import RoomGrid, { CeldaGrid }       from './RoomGrid'
import RoomItemSelector, { ItemType } from './RoomItemSelector'

interface Props {
  isOpen:     boolean
  sucursalId: string
  sucursalNombre: string
  onClose:    () => void
  onSuccess:  () => void
}

const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 bg-gray-50 transition placeholder:text-gray-400"

export default function ModalNuevoRoom({ isOpen, sucursalId, sucursalNombre, onClose, onSuccess }: Props) {
  const [loading,      setLoading]      = useState(false)
  const [nombre,       setNombre]       = useState('')
  const [descripcion,  setDescripcion]  = useState('')
  const [capacidad,    setCapacidad]    = useState(0)
  const [ancho,        setAncho]        = useState(0)
  const [alto,         setAlto]         = useState(0)
  const [zoom,         setZoom]         = useState(100)
  const [celdas,       setCeldas]       = useState<CeldaGrid[]>([])
  const [itemSelected, setItemSelected] = useState<ItemType>(null)
  const [imagenPlano,  setImagenPlano]  = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Contadores por tipo para numeración automática
  const getNextNumero = (tipo: ItemType): string => {
    if (!tipo || tipo === 'Coach' || tipo === 'Entrada') return ''
    const prefix = tipo === 'Rack' ? 'R' : 'M'
    const existentes = celdas.filter(c => c.tipo === tipo).length
    return `${prefix}${existentes + 1}`
  }

  // Spots disponibles = celdas con Rack o Mat sin bloquear
  const spotsDisponibles = celdas.filter(c =>
    (c.tipo === 'Rack' || c.tipo === 'Mat') && !c.bloqueado
  ).length

  const handleCeldaClick = (fila: number, columna: number) => {
    if (!itemSelected) return

    const existente = celdas.find(c => c.fila === fila && c.columna === columna)

    if (existente) {
      // Si ya tiene item, quitar
      setCeldas(prev => prev.filter(c => !(c.fila === fila && c.columna === columna)))
      return
    }

    // Verificar límite de spots (solo Rack y Mat cuentan)
    if ((itemSelected === 'Rack' || itemSelected === 'Mat') && spotsDisponibles >= capacidad) {
      alert(`Ya alcanzaste la capacidad máxima de ${capacidad} spots`)
      return
    }

    const numero = getNextNumero(itemSelected)
    setCeldas(prev => [...prev, {
      fila,
      columna,
      tipo:     itemSelected,
      numero,
      bloqueado: false,
    }])
  }

  const handleCambiarDimension = (dim: 'ancho' | 'alto', valor: number) => {
    const nuevoValor = Math.max(0, Math.min(20, valor))
    if (dim === 'ancho') setAncho(nuevoValor)
    else setAlto(nuevoValor)

    // Limpiar celdas que queden fuera de la nueva cuadrícula
    setCeldas(prev => prev.filter(c =>
      dim === 'ancho'
        ? c.columna < nuevoValor
        : c.fila < nuevoValor
    ))
  }

  const handleGuardar = async () => {
    if (!nombre) return
    setLoading(true)

    let imagenUrl = null

    // Subir imagen si hay
    if (imagenPlano) {
      const ext  = imagenPlano.name.split('.').pop()
      const path = `${sucursalId}/${Date.now()}.${ext}`
      await supabase.storage.from('staff-documentos').upload(path, imagenPlano, { upsert: true })
      const { data: urlData } = supabase.storage.from('staff-documentos').getPublicUrl(path)
      imagenUrl = urlData.publicUrl
    }

    // Crear room
    const { data: room, error } = await supabase.from('rooms').insert({
      sucursal_id:  sucursalId,
      nombre,
      descripcion,
      capacidad,
      ancho,
      alto,
      layout:       celdas,
      imagen_plano: imagenUrl,
      estatus:      'Activo',
    }).select().single()

    if (error || !room) {
      alert('Error: ' + error?.message)
      setLoading(false)
      return
    }

    // Crear spots individuales
    const spots = celdas.filter(c => c.tipo === 'Rack' || c.tipo === 'Mat')
    if (spots.length > 0) {
      await supabase.from('room_spots').insert(
        spots.map(s => ({
          room_id:  room.id,
          numero:   s.numero,
          tipo:     s.tipo,
          fila:     s.fila,
          columna:  s.columna,
          bloqueado: false,
        }))
      )
    }

    setLoading(false)
    onSuccess()
    handleClose()
  }

  const handleClose = () => {
    setNombre(''); setDescripcion(''); setCapacidad(0)
    setAncho(0); setAlto(0); setZoom(100)
    setCeldas([]); setItemSelected(null); setImagenPlano(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      <div onClick={handleClose} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-black text-gray-900">Nuevo room</span>
              <span className="text-gray-300">›</span>
              <span className="text-gray-500">{sucursalNombre}</span>
            </div>
            <button onClick={handleClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* Room + Capacidad */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">
                  Room* <span className="text-red-500">*</span>
                </label>
                <input placeholder="Hyrox" className={inputCls}
                  value={nombre} onChange={e => setNombre(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">
                  Capacidad máxima (SPOTS)*
                </label>
                <div className="flex items-center border border-gray-200 rounded-xl bg-gray-50 overflow-hidden">
                  <button type="button" onClick={() => setCapacidad(p => Math.max(0, p - 1))}
                    className="px-3 py-2.5 text-gray-400 hover:bg-gray-100 transition">
                    <Minus size={14}/>
                  </button>
                  <span className="flex-1 text-center text-sm font-bold text-gray-900">{capacidad}</span>
                  <button type="button" onClick={() => setCapacidad(p => p + 1)}
                    className="px-3 py-2.5 text-gray-400 hover:bg-gray-100 transition">
                    <Plus size={14}/>
                  </button>
                </div>
              </div>
            </div>

            {/* Tipo de layout */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Tipo de layout*</label>
              <div className="border border-gray-200 rounded-xl px-4 py-3 bg-gray-50">
                <p className="text-sm font-bold text-gray-700">Plano libre</p>
                <p className="text-xs text-gray-400">Coloca pins o sube imagen</p>
              </div>
            </div>

            {/* Selector de items */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Seleccionar item*</label>
              <RoomItemSelector selected={itemSelected} onSelect={setItemSelected} />
            </div>

            {/* Controles cuadrícula */}
            <div className="border border-gray-200 rounded-xl px-4 py-3 space-y-3 bg-gray-50">
              <p className="text-xs font-bold text-gray-500">
                Cuadrícula de {ancho}×{alto}
              </p>
              <div className="flex items-center gap-4 flex-wrap">
                {/* Ancho */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-medium">Ancho:</span>
                  <button onClick={() => handleCambiarDimension('ancho', ancho - 1)}
                    className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs bg-white">−</button>
                  <span className="w-6 text-center text-sm font-bold text-gray-900">{ancho}</span>
                  <button onClick={() => handleCambiarDimension('ancho', ancho + 1)}
                    className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs bg-white">+</button>
                </div>
                {/* Alto */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-medium">Alto:</span>
                  <button onClick={() => handleCambiarDimension('alto', alto - 1)}
                    className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs bg-white">−</button>
                  <span className="w-6 text-center text-sm font-bold text-gray-900">{alto}</span>
                  <button onClick={() => handleCambiarDimension('alto', alto + 1)}
                    className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs bg-white">+</button>
                </div>
                {/* Zoom */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-medium">Zoom:</span>
                  <button onClick={() => setZoom(p => Math.max(50, p - 10))}
                    className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs bg-white">−</button>
                  <span className="w-10 text-center text-xs font-bold text-gray-900">{zoom}%</span>
                  <button onClick={() => setZoom(p => Math.min(200, p + 10))}
                    className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs bg-white">+</button>
                </div>
              </div>
              <p className="text-[11px] text-gray-400">
                Click en el mapa para colocar · Arrastra para mover · Doble click para bloquear
              </p>
            </div>

            {/* Instrucción */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-700">Mapa de room*</p>
              <p className="text-xs text-gray-400">
                <span className={spotsDisponibles >= capacidad && capacidad > 0 ? 'text-emerald-500 font-bold' : ''}>
                  {spotsDisponibles}
                </span>
                /{capacidad} spots disponibles
              </p>
            </div>

            {/* Grid */}
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 min-h-[200px] flex items-center justify-center">
              <RoomGrid
                ancho={ancho}
                alto={alto}
                celdas={celdas}
                itemSelected={itemSelected}
                zoom={zoom}
                onCeldaClick={handleCeldaClick}
              />
            </div>

            {/* Leyenda */}
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-blue-200 border border-blue-400" /> Disponible
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-gray-200 border border-gray-300" /> Bloqueado
              </span>
              <span className="ml-auto text-gray-400">
                Toca un spot para bloquear/desbloquear · Total: {celdas.length}
              </span>
            </div>

            {/* Subir imagen */}
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-gray-700">O sube una imagen del plano</p>
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-600 transition">
                <Upload size={16} />
                {imagenPlano ? imagenPlano.name : 'Subir imagen'}
              </button>
              <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
                onChange={e => setImagenPlano(e.target.files?.[0] || null)} />
            </div>

            {/* Descripción */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Descripción*</label>
              <textarea rows={3} placeholder="Descripción del room y funcionalidad."
                className={`${inputCls} resize-none`}
                value={descripcion} onChange={e => setDescripcion(e.target.value)} />
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
            <button onClick={handleClose}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button onClick={handleGuardar} disabled={loading || !nombre || capacidad === 0}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition"
              style={{ backgroundColor: '#171B24' }}>
              {loading ? 'Creando...' : 'Crear room'}
            </button>
          </div>
        </div>
    </>
  )
}