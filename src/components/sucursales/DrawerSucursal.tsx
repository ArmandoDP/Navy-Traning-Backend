'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { X, MapPin, Clock, Trash2 } from 'lucide-react'
import CiudadCombobox from '@/components/sucursales/CiudadCombobox'

interface Props {
  isOpen:    boolean
  onClose:   () => void
  onSuccess: () => void
  sucursal?: any // si viene = modo editar
}

const COLORES = [
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#67E8F9', // cyan
  '#D97706', // amber
  '#92400E', // brown
  '#16A34A', // green
  '#EA580C', // orange
  '#22D3EE', // sky
  '#A855F7', // violet
]

const BANCOS = [
  'BBVA', 'Banamex', 'Santander', 'Banorte', 'HSBC',
  'Scotiabank', 'Inbursa', 'Azteca', 'BanBajío', 'Otro',
]

const inputCls = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 bg-gray-50 transition placeholder:text-gray-400'
const selectCls = `${inputCls} appearance-none cursor-pointer`

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const EMPTY = {
  nombre:          '',
  codigo:          '',
  ciudad:          '',
  color:           '#3B82F6',
  direccion:       '',
  horario:         '',
  telefono:        '',
  gerente:         '',
  banco:           '',
  cuenta_bancaria: '',
  es_matriz:       false,
  estatus:         'Activa',
  capacidad:       100,
}

export default function DrawerSucursal({ isOpen, onClose, onSuccess, sucursal }: Props) {
  const editando = !!sucursal
  const [loading,  setLoading]  = useState(false)
  const [form,     setForm]     = useState({ ...EMPTY })
  const [popup, setPopup] = useState<{ tipo: 'error' | 'exito'; mensaje: string } | null>(null)
  const [managers, setManagers] = useState<{ id: string; nombre: string; primer_apellido: string }[]>([])

  const validarHorario = (horario: string) => {
    if (!horario) return false
    // Acepta formatos como "L-V: 05:45-21:30 | S: 07:00-11:00"
    const regex = /^[A-Za-záéíóúÁÉÍÓÚüÜñÑ\s,\-:|\d]+$/
    return regex.test(horario) && horario.length >= 5
  }

  const validarCuenta = (cuenta: string) => {
    const raw = cuenta.replace(/\s/g, '')
    return raw.length === 16 && /^\d+$/.test(raw)
  }

  // Sincroniza form cuando se abre en modo editar
  useEffect(() => {
    if (isOpen) {
      setForm(sucursal ? {
        nombre:          sucursal.nombre          || '',
        codigo:          sucursal.codigo          || '',
        ciudad:          sucursal.ciudad          || '',
        color:           sucursal.color           || '#3B82F6',
        direccion:       sucursal.direccion       || '',
        horario:         sucursal.horario         || '',
        telefono:        sucursal.telefono        || '',
        gerente:         sucursal.gerente         || '',
        banco:           sucursal.banco           || '',
        cuenta_bancaria: sucursal.cuenta_bancaria || '',
        es_matriz:       sucursal.es_matriz       || false,
        estatus:         sucursal.estatus         || 'Activa',
        capacidad:       sucursal.capacidad       || 100,
      } : { ...EMPTY })

      // Fetch managers
      supabase
        .from('staff')
        .select('id, nombre, primer_apellido')
        .eq('tipo', 'Manager')
        .eq('estatus', 'Activo')
        .order('nombre')
        .then(({ data }) => { if (data) setManagers(data) })
    }
  }, [isOpen, sucursal])

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async () => {
    // Validar campos requeridos
    if (!form.nombre) {
      setPopup({ tipo: 'error', mensaje: 'El nombre de la sucursal es obligatorio.' })
      return
    }
    if (!form.ciudad) {
      setPopup({ tipo: 'error', mensaje: 'La ciudad es obligatoria.' })
      return
    }
    if (!form.codigo) {
      setPopup({ tipo: 'error', mensaje: 'El código de la sucursal es obligatorio.' })
      return
    }
    if (!form.direccion) {
      setPopup({ tipo: 'error', mensaje: 'La dirección es obligatoria.' })
      return
    }
    if (!form.telefono) {
      setPopup({ tipo: 'error', mensaje: 'El teléfono es obligatorio.' })
      return
    }
    if (!form.gerente) {
      setPopup({ tipo: 'error', mensaje: 'El gerente es obligatorio.' })
      return
    }
    if (!validarHorario(form.horario)) {
      setPopup({ tipo: 'error', mensaje: 'El horario tiene un formato inválido. Ejemplo: L-V: 05:45-21:30 | S: 07:00-11:00' })
      return
    }

    setLoading(true)

    const payload = {
      nombre:          form.nombre,
      codigo:          form.codigo.toUpperCase(),
      ciudad:          form.ciudad,
      color:           form.color,
      direccion:       form.direccion,
      horario:         form.horario,
      telefono:        form.telefono,
      gerente:         form.gerente,
      banco:           form.banco,
      cuenta_bancaria: form.cuenta_bancaria,
      es_matriz:       form.es_matriz,
      estatus:         form.estatus,
      capacidad:       Number(form.capacidad),
    }

    const { error } = editando
      ? await supabase.from('sucursales').update(payload).eq('id', sucursal.id)
      : await supabase.from('sucursales').insert([payload])
    
    supabase.from('staff')
      .select('id, nombre, primer_apellido')
      .eq('tipo', 'Manager')
      .eq('estatus', 'Activo')
      .order('nombre')
      .then(({ data }) => { if (data) setManagers(data) })

    if (error) {
      setPopup({ tipo: 'error', mensaje: 'Error al guardar: ' + error.message })
      setLoading(false)
      return
    }

    setPopup({ tipo: 'exito', mensaje: editando ? 'Sucursal actualizada correctamente.' : 'Sucursal creada correctamente.' })
    setTimeout(() => {
      setPopup(null)
      onSuccess()
      onClose()
    }, 1500)

    setLoading(false)
  }

  const handleEliminar = async () => {
    if (!confirm('¿Seguro que quieres eliminar esta sucursal? Esta acción no se puede deshacer.')) return
    setLoading(true)
    const { error } = await supabase.from('sucursales').delete().eq('id', sucursal.id)
    if (error) { alert('Error: ' + error.message); setLoading(false); return }
    onSuccess()
    onClose()
    setLoading(false)
  }

  const canSubmit = !loading

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer */}
      <div className={`fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Popup DENTRO del drawer */}
        {popup && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-black/20 rounded-2xl">
            <div className={`bg-white rounded-2xl shadow-2xl border px-6 py-5 w-full flex flex-col gap-3 ${
              popup.tipo === 'error' ? 'border-red-100' : 'border-emerald-100'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0 ${
                  popup.tipo === 'error' ? 'bg-red-50' : 'bg-emerald-50'
                }`}>
                  {popup.tipo === 'error' ? '⚠️' : '✅'}
                </div>
                <div>
                  <p className="text-sm font-black text-gray-900">
                    {popup.tipo === 'error' ? 'Revisa los datos' : '¡Listo!'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{popup.mensaje}</p>
                </div>
              </div>
              <button onClick={() => setPopup(null)}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition"
                style={{ backgroundColor: popup.tipo === 'error' ? '#ef4444' : '#171B24' }}>
                {popup.tipo === 'error' ? 'Corregir' : 'Cerrar'}
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-black text-gray-900">
              {editando ? 'Editar sucursal' : 'Crear nueva sucursal'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {editando ? 'Modifica los datos de la sucursal' : 'Alta de nueva sucursal'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Nombre de la sucursal */}
          <Field label="Nombre de la sucursal" required>
            <input
              className={inputCls}
              placeholder="Nombre comercial"
              value={form.nombre}
              onChange={e => set('nombre', e.target.value)}
            />
          </Field>

          {/* Código + Ciudad */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código (3 letras)" required>
              <input
                className={inputCls}
                placeholder="COD"
                maxLength={3}
                value={form.codigo}
                onChange={e => set('codigo', e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Ciudad" required>
              <CiudadCombobox
                value={form.ciudad}
                onChange={v => set('ciudad', v)}
                required
              />
            </Field>
          </div>

          {/* Color de identificación */}
          <Field label="Color de identificación">
            <div className="flex items-center gap-2 flex-wrap">
              {COLORES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('color', c)}
                  className={`w-8 h-8 rounded-lg transition-all ${
                    form.color === c
                      ? 'ring-2 ring-offset-2 ring-gray-400 scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </Field>

          {/* Dirección */}
          <Field label="Dirección" required>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className={`${inputCls} pl-8`}
                placeholder="Introduce una dirección"
                value={form.direccion}
                onChange={e => set('direccion', e.target.value)}
              />
            </div>
          </Field>

          {/* Horario de operación */}
          <Field label="Horario de operación" required>
            <div className="relative">
              <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className={`${inputCls} pl-8`}
                placeholder="L-V: 05:45-11:00, 17:00-21:30 | L-J: 05:45-22:00 | S: 07:50-11:00 | D: 10:00-11:00"
                value={form.horario}
                onChange={e => set('horario', e.target.value)}
              />
            </div>
          </Field>

          {/* Teléfono + Gerente */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono recepción" required>
              <input
                className={inputCls}
                placeholder="000 000 0000"
                value={form.telefono}
                onChange={e => set('telefono', e.target.value)}
              />
            </Field>
            <Field label="Gerente de la sucursal" required>
              <select className={selectCls} value={form.gerente} onChange={e => set('gerente', e.target.value)}>
                <option value="">Seleccionar gerente</option>
                {managers.map(m => (
                  <option key={m.id} value={`${m.nombre} ${m.primer_apellido}`.trim()}>
                    {m.nombre} {m.primer_apellido}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Banco + Cuenta */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Banco">
              <select
                className={selectCls}
                value={form.banco}
                onChange={e => set('banco', e.target.value)}
              >
                <option value="">Seleccionar</option>
                {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Cuenta bancaria">
              <input
                className={inputCls}
                placeholder="0000 0000 0000 0000"
                maxLength={19}
                value={form.cuenta_bancaria}
                onChange={e => set('cuenta_bancaria', e.target.value)}
              />
            </Field>
          </div>

          {/* Sucursal matriz */}
          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              id="es_matriz"
              checked={form.es_matriz}
              onChange={e => set('es_matriz', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 accent-gray-900 cursor-pointer"
            />
            <label htmlFor="es_matriz" className="text-sm text-gray-700 cursor-pointer select-none">
              Marcar como sucursal matriz
            </label>
          </div>

          {/* Eliminar (solo en edición) */}
          {editando && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleEliminar}
                className="flex items-center gap-2 text-red-500 hover:text-red-600 text-sm font-medium transition"
              >
                <Trash2 size={15} />
                Eliminar sucursal
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition"
            style={{ backgroundColor: '#171B24' }}
          >
            {loading ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear sucursal'}
          </button>
        </div>
      </div>
    </>
  )
}