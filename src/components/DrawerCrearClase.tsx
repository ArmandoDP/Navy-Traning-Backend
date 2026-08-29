'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Minus, Plus } from 'lucide-react'
import RecurrenciaConfig from '@/components/clases/RecurrenciaConfig'

interface Coach    { id: string; nombre: string; primer_apellido: string }
interface Sucursal { id: string; nombre: string }
interface Room     { id: string; nombre: string; capacidad: number }

interface Props {
  isOpen:      boolean
  onClose:     () => void
  onSuccess:   () => void
  sucursalId?: string
}

const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-gray-50 transition"
const selectCls = `${inputCls} appearance-none cursor-pointer`

export default function DrawerCrearClase({ isOpen, onClose, onSuccess, sucursalId }: Props) {
  const [loading,          setLoading]          = useState(false)
  const [coaches,          setCoaches]          = useState<Coach[]>([])
  const [sucursales,       setSucursales]       = useState<Sucursal[]>([])
  const [rooms,            setRooms]            = useState<Room[]>([])
  const [recurrenciaTipo,  setRecurrenciaTipo]  = useState('semanal')
  const [recurrenciaFin,   setRecurrenciaFin]   = useState('')

  const [form, setForm] = useState({
    nombre_clase:     '',
    sucursal_id:      sucursalId || '',
    coach_id:         '',
    room_id:          '',
    fecha:            '',
    hora:             '',
    duracion_minutos: 60,
    capacidad_max:    0,
    descripcion:      '',
    es_recurrente:    false,
    publicar_wellhub: false,
    publicar_totalpass: false,
  })

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  // Fetch inicial
  useEffect(() => {
    if (!isOpen) return
    setForm(p => ({ ...p, sucursal_id: sucursalId || '', room_id: '' }))

    Promise.all([
      supabase.from('staff').select('id, nombre, primer_apellido').eq('tipo', 'Coach').eq('estatus', 'Activo').order('nombre'),
      supabase.from('sucursales').select('id, nombre').eq('estatus', 'Activa').order('nombre'),
    ]).then(([{ data: c }, { data: s }]) => {
      if (c) setCoaches(c)
      if (s) setSucursales(s)
    })
  }, [isOpen, sucursalId])

  // Fetch rooms cuando cambia la sucursal
  useEffect(() => {
    if (!form.sucursal_id) { setRooms([]); return }
    supabase.from('rooms')
      .select('id, nombre, capacidad')
      .eq('sucursal_id', form.sucursal_id)
      .eq('estatus', 'Activo')
      .order('nombre')
      .then(({ data }) => {
        setRooms(data || [])
        set('room_id', '') // reset room al cambiar sucursal
      })
  }, [form.sucursal_id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.room_id) {
      alert('Debes seleccionar un room para la clase')
      return
    }
    setLoading(true)

    const horario = form.fecha && form.hora
      ? new Date(`${form.fecha}T${form.hora}`).toISOString()
      : new Date().toISOString()

    const coach = coaches.find(c => c.id === form.coach_id)
    const room  = rooms.find(r => r.id === form.room_id)

    const payloadBase = {
      nombre_clase:     form.nombre_clase,
      coach_id:         form.coach_id         || null,
      sucursal_id:      form.sucursal_id       || null,
      room_id:          form.room_id           || null,
      instructor:       coach ? `${coach.nombre} ${coach.primer_apellido}` : '',
      salon:            room?.nombre           || 'Sala Principal',
      duracion_minutos: form.duracion_minutos,
      capacidad_max:    form.capacidad_max,
      descripcion:      form.descripcion,
      es_recurrente:    form.es_recurrente,
      estado:           'Activa',
      tipo_clase:       'General',
      publicar_wellhub: form.publicar_wellhub,
      publicar_totalpass: form.publicar_totalpass,
      recurrencia_tipo: form.es_recurrente ? recurrenciaTipo : null,
      recurrencia_fin:  form.es_recurrente && recurrenciaFin ? recurrenciaFin : null,
    }

    // 1. Crear clase principal
    const { data: claseCreada, error } = await supabase.from('clases')
      .insert([{ ...payloadBase, horario }])
      .select().single()

    if (error) {
      alert('Error: ' + error.message)
      setLoading(false)
      return
    }

    // 2. Si es recurrente crear hijas
    if (form.es_recurrente && recurrenciaFin && recurrenciaTipo && claseCreada) {
      const clasesHijas = []
      let fechaActual   = new Date(horario)
      const fechaLimite = new Date(recurrenciaFin)

      const incrementar = (d: Date) => {
        const nueva = new Date(d)
        if (recurrenciaTipo === 'diario')    nueva.setDate(nueva.getDate() + 1)
        if (recurrenciaTipo === 'semanal')   nueva.setDate(nueva.getDate() + 7)
        if (recurrenciaTipo === 'quincenal') nueva.setDate(nueva.getDate() + 14)
        if (recurrenciaTipo === 'mensual')   nueva.setMonth(nueva.getMonth() + 1)
        return nueva
      }

      fechaActual = incrementar(fechaActual)
      while (fechaActual <= fechaLimite) {
        clasesHijas.push({ ...payloadBase, horario: fechaActual.toISOString(), clase_padre_id: claseCreada.id })
        fechaActual = incrementar(fechaActual)
      }
      if (clasesHijas.length > 0) await supabase.from('clases').insert(clasesHijas)
    }

    // 3. Publicar en Wellhub si aplica
    if (form.publicar_wellhub && claseCreada) {
      try {
        const res = await fetch('/api/wellhub/publicar-clase', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            claseId:         claseCreada.id,
            nombre:          form.nombre_clase,
            descripcion:     form.descripcion,
            horario,
            duracionMinutos: form.duracion_minutos,
            capacidadMax:    form.capacidad_max,
          }),
        })
        const data = await res.json()
        if (!res.ok) alert('Clase creada, pero error en Wellhub: ' + data.error)
      } catch (err: any) {
        alert('Clase creada, pero no se pudo conectar con Wellhub: ' + err.message)
      }
    }

    // 4. Publicar en TotalPass si aplica
    if (form.publicar_totalpass && claseCreada) {
      try {
        const coach = coaches.find(c => c.id === form.coach_id)
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/totalpass-booking/publicar-clase`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clase_id:         claseCreada.id,
            sucursal_id:      form.sucursal_id,
            nombre:           form.nombre_clase,
            descripcion:      form.descripcion,
            horario,
            duracion_minutos: form.duracion_minutos,
            capacidad_max:    form.capacidad_max,
            coach:            coach ? `${coach.nombre} ${coach.primer_apellido}` : 'Navy Coach',
          }),
        })
        const data = await res.json()
        if (!res.ok) alert('Clase creada, pero error en TotalPass: ' + data.detail)
      } catch (err: any) {
        alert('Clase creada, pero no se pudo conectar con TotalPass: ' + err.message)
      }
    }

    onSuccess()
    onClose()
    setForm({
      nombre_clase: '', sucursal_id: sucursalId || '', coach_id: '',
      room_id: '', fecha: '', hora: '', duracion_minutos: 60,
      capacidad_max: 0, descripcion: '', es_recurrente: false, publicar_wellhub: false, publicar_totalpass: false,
    })
    setRecurrenciaTipo('semanal')
    setRecurrenciaFin('')
    setLoading(false)
  }

  const sucursalFija = sucursalId
    ? sucursales.find(s => s.id === sucursalId)?.nombre || '...'
    : null

  if (!isOpen) return null

  return (
    <>
      <div onClick={onClose}
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />

      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-black text-gray-900">Crear nueva clase</h2>
            <p className="text-xs text-gray-400 mt-0.5">Alta de clase</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-400">
            <X size={18}/>
          </button>
        </div>

        {/* Form */}
        <form id="drawer-crear-clase" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Nombre */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">
              Nombre de la clase <span className="text-red-500">*</span>
            </label>
            <input required placeholder="Nombre" className={inputCls}
              value={form.nombre_clase} onChange={e => set('nombre_clase', e.target.value)} />
          </div>

          {/* Sucursal + Coach */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">
                Sucursal <span className="text-red-500">*</span>
              </label>
              {sucursalFija ? (
                <div className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 bg-gray-100">
                  {sucursalFija}
                </div>
              ) : (
                <select required className={selectCls}
                  value={form.sucursal_id} onChange={e => set('sucursal_id', e.target.value)}>
                  <option value="">Seleccionar</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Coach</label>
              <select className={selectCls}
                value={form.coach_id} onChange={e => set('coach_id', e.target.value)}>
                <option value="">Seleccionar</option>
                {coaches.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.primer_apellido}</option>)}
              </select>
            </div>
          </div>

          {/* Room */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">
              Room <span className="text-red-500">*</span>
            </label>
            {!form.sucursal_id ? (
              <div className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-400 bg-gray-50 italic">
                Selecciona una sucursal primero
              </div>
            ) : rooms.length === 0 ? (
              <div className="w-full border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-600 bg-amber-50">
                No hay rooms en esta sucursal — crea uno primero
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {rooms.map(r => (
                  <button key={r.id} type="button"
                    onClick={() => set('room_id', form.room_id === r.id ? '' : r.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                      form.room_id === r.id
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}>
                    {form.room_id === r.id && '✓ '}
                    {r.nombre}
                    <span className={`text-[10px] px-1 rounded-full ${
                      form.room_id === r.id ? 'bg-white/20' : 'bg-gray-100'
                    }`}>
                      {r.capacidad} spots
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fecha + Hora */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">
                Fecha <span className="text-red-500">*</span>
              </label>
              <input required type="date" className={inputCls}
                value={form.fecha} onChange={e => set('fecha', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">
                Hora <span className="text-red-500">*</span>
              </label>
              <input required type="time" className={inputCls}
                value={form.hora} onChange={e => set('hora', e.target.value)} />
            </div>
          </div>

          {/* Duración + Capacidad */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">
                Duración (minutos) <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center border border-gray-200 rounded-xl bg-gray-50 overflow-hidden">
                <button type="button" onClick={() => set('duracion_minutos', Math.max(0, form.duracion_minutos - 5))}
                  className="px-3 py-2.5 text-gray-400 hover:bg-gray-100 transition"><Minus size={14}/></button>
                <span className="flex-1 text-center text-sm font-medium text-gray-900">{form.duracion_minutos}</span>
                <button type="button" onClick={() => set('duracion_minutos', form.duracion_minutos + 5)}
                  className="px-3 py-2.5 text-gray-400 hover:bg-gray-100 transition"><Plus size={14}/></button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">
                Capacidad máxima <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center border border-gray-200 rounded-xl bg-gray-50 overflow-hidden">
                <button type="button" onClick={() => set('capacidad_max', Math.max(0, form.capacidad_max - 1))}
                  className="px-3 py-2.5 text-gray-400 hover:bg-gray-100 transition"><Minus size={14}/></button>
                <span className="flex-1 text-center text-sm font-medium text-gray-900">{form.capacidad_max}</span>
                <button type="button" onClick={() => set('capacidad_max', form.capacidad_max + 1)}
                  className="px-3 py-2.5 text-gray-400 hover:bg-gray-100 transition"><Plus size={14}/></button>
              </div>
            </div>
          </div>

          {/* Descripción */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Descripción</label>
            <textarea rows={3} placeholder="Descripción de la clase..."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-indigo-400 bg-gray-50 resize-none"
              value={form.descripcion} onChange={e => set('descripcion', e.target.value)} />
          </div>

          {/* Recurrente */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.es_recurrente}
                onChange={e => set('es_recurrente', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              <span className="text-sm text-gray-700">Clase recurrente</span>
            </label>
            <RecurrenciaConfig
              activo={form.es_recurrente}
              tipo={recurrenciaTipo}
              fechaFin={recurrenciaFin}
              onTipo={setRecurrenciaTipo}
              onFin={setRecurrenciaFin}
            />
          </div>

          {/* Wellhub */}
          <label className="flex items-center gap-2 cursor-pointer bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
            <input type="checkbox" checked={form.publicar_wellhub}
              onChange={e => set('publicar_wellhub', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
            <span className="text-sm text-gray-700">
              🏃 Publicar también en Wellhub <span className="text-gray-400 text-xs">(visible para usuarios de Wellhub)</span>
            </span>
          </label>
          
          {/* TotalPass */}
          <label className="flex items-center gap-2 cursor-pointer bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <input type="checkbox" checked={form.publicar_totalpass}
              onChange={e => set('publicar_totalpass', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-gray-700">
              🏋️ Publicar también en TotalPass <span className="text-gray-400 text-xs">(visible para usuarios de TotalPass)</span>
            </span>
          </label>

        </form>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-white">
          <button type="button" onClick={onClose}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button type="submit" form="drawer-crear-clase" disabled={loading || !form.room_id}
            className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition">
            {loading ? 'Creando...' : 'Crear clase'}
          </button>
        </div>
      </div>
    </>
  )
}