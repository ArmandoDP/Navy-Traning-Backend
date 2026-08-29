'use client'
import { useState, useEffect } from 'react'
import { supabase }            from '@/lib/supabase'
import { X, User, CreditCard, Calendar, Lock } from 'lucide-react'
import ToastExito              from '@/components/ToastExito'
import ModalInvitado from './ModalInvitado'

interface Props {
  isOpen:    boolean
  onClose:   () => void
  onSuccess: () => void
}

interface Sucursal { id: string; nombre: string }
interface Paquete  { id: string; nombre: string; vigencia_dias?: number }

const SEXOS      = ['Masculino', 'Femenino', 'Prefiero no decir']
const FORMAS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia', 'OXXO', 'Terminal']

const inputCls  = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 bg-gray-50 transition placeholder:text-gray-400"
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

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className="text-gray-400">{icon}</span>
      <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">{children}</h3>
    </div>
  )
}

// Genera password temporal
function generarPasswordTemporal(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return 'NAVY-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// Calcula fecha_fin según vigencia del paquete
function calcularFechaFin(fechaInicio: string, diasVigencia: number): string {
  const d = new Date(fechaInicio)
  d.setDate(d.getDate() + diasVigencia)
  return d.toISOString().split('T')[0]
}

export default function DrawerNuevoCliente({ isOpen, onClose, onSuccess }: Props) {
  const [loading,    setLoading]    = useState(false)
  const [toast,      setToast]      = useState(false)
  const [nuevoId,    setNuevoId]    = useState<string | null>(null)
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [paquetes,   setPaquetes]   = useState<Paquete[]>([])
  const [modalInvitado, setModalInvitado] = useState(false)
  const [titularId,     setTitularId]     = useState<string | null>(null)

  // Tipo de registro
  const [tipoRegistro, setTipoRegistro] = useState<'nuevo' | 'migracion'>('nuevo')

  const [form, setForm] = useState({
    nombre:            '',
    primer_apellido:   '',
    segundo_apellido:  '',
    email:             '',
    telefono:          '',
    fecha_nacimiento:  '',
    sexo:              '',
    sucursal_id:       '',
    paquete_id:        '',
    forma_pago:        '',
    // Membresía
    fecha_inicio_membresia: new Date().toISOString().split('T')[0],
    fecha_fin_membresia:    '',
    dias_renovacion:        '',
    // Migración
    fecha_alta_original:    '',
    notas_migracion:        '',
  })

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!isOpen) return
    setTipoRegistro('nuevo')
    supabase.from('sucursales').select('id, nombre').eq('estatus', 'Activa').order('nombre')
      .then(({ data: sucs }) => { if (sucs) setSucursales(sucs) })
  }, [isOpen])

  useEffect(() => {
    if (!form.sucursal_id) { setPaquetes([]); return }

    supabase
      .from('paquetes')
      .select('id, nombre, vigencia_dias, max_usuarios, paquete_precios!inner(sucursal_id)')
      .eq('estatus', 'Activo')
      .eq('paquete_precios.sucursal_id', form.sucursal_id)
      .order('nombre')
      .then(({ data: pqs }) => {
        if (pqs) setPaquetes(pqs)
      })

  // Resetear paquete seleccionado cuando cambia sucursal
  setForm(p => ({ ...p, paquete_id: '', fecha_fin_membresia: '' }))
}, [form.sucursal_id])

  // Auto-calcular fecha_fin cuando cambia paquete o fecha_inicio
  useEffect(() => {
    const paquete = paquetes.find(p => p.id === form.paquete_id)
    if (paquete?.vigencia_dias && form.fecha_inicio_membresia) {
      const fechaFin = calcularFechaFin(form.fecha_inicio_membresia, paquete.vigencia_dias)
      setForm(p => ({ ...p, fecha_fin_membresia: fechaFin }))
    }
  }, [form.paquete_id, form.fecha_inicio_membresia, paquetes])

  const resetForm = () => {
    setForm({
      nombre: '', primer_apellido: '', segundo_apellido: '',
      email: '', telefono: '', fecha_nacimiento: '', sexo: '',
      sucursal_id: '', paquete_id: '', forma_pago: '',
      fecha_inicio_membresia: new Date().toISOString().split('T')[0],
      fecha_fin_membresia: '', dias_renovacion: '',
      fecha_alta_original: '', notas_migracion: '',
    })
    setTipoRegistro('nuevo')
  }

  const handleCrear = async () => {
    console.log('tipoRegistro:', tipoRegistro)
    if (!form.nombre || !form.email) return
    setLoading(true)

    const passwordTemporal = generarPasswordTemporal()
    const paquete          = paquetes.find(p => p.id === form.paquete_id)

    // 1. Crear usuario en Supabase Auth
    let supabaseUserId: string | null = null
    try {
      const res = await fetch('/api/clientes/crear-usuario', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: form.email, password: passwordTemporal }),
      })
      const data = await res.json()
      supabaseUserId = data.userId || null
    } catch {
      console.warn('No se pudo crear usuario Auth')
    }

    // 2. Crear cliente
    const { data: nuevoCliente, error } = await supabase.from('clientes').insert([{
      nombre_completo:      `${form.nombre} ${form.primer_apellido} ${form.segundo_apellido}`.trim(),
      primer_apellido:      form.primer_apellido,
      segundo_apellido:     form.segundo_apellido,
      email:                form.email,
      telefono:             form.telefono,
      fecha_nacimiento:     form.fecha_nacimiento || null,
      sexo:                 form.sexo,
      sucursal_id:          form.sucursal_id  || null,
      paquete_id:           form.paquete_id   || null,
      plan:                 paquete?.nombre   || '',
      forma_pago:           form.forma_pago,
      estatus:              'Activo',
      origen:               tipoRegistro === 'migracion' ? 'Migración' : 'Nuevo', // ← esta faltaba
      supabase_user_id:     supabaseUserId,
      password_temporal:    passwordTemporal,
      debe_cambiar_password: true,
      fecha_alta_original:  tipoRegistro === 'migracion'
        ? (form.fecha_alta_original || new Date().toISOString().split('T')[0])
        : new Date().toISOString().split('T')[0],
    }]).select().single()

    if (error) {
      alert('Error: ' + error.message)
      setLoading(false)
      return
    }

    // 3. Crear membresía
    if (nuevoCliente && form.paquete_id) {
      const fechaInicio = form.fecha_inicio_membresia || new Date().toISOString().split('T')[0]
      const fechaFin    = form.fecha_fin_membresia ||
        (paquete?.vigencia_dias ? calcularFechaFin(fechaInicio, paquete.vigencia_dias) : fechaInicio)

      await supabase.from('membresias').insert([{
        cliente_id:    nuevoCliente.id,
        paquete_id:    form.paquete_id,
        fecha_inicio:  fechaInicio,
        fecha_fin:     fechaFin,
        origen:        tipoRegistro === 'migracion' ? 'Migración' : 'Nuevo',
        estatus:       'Activa',
        precio_pagado: 0,
        notas:         form.notas_migracion || null,
      }])
    }

    // 4. Registrar pago si es nuevo (no migración)
    if (nuevoCliente && form.paquete_id && tipoRegistro === 'nuevo') {
      await supabase.from('pagos').insert([{
        cliente_id:  nuevoCliente.id,
        monto:       0,
        metodo_pago: form.forma_pago || 'Efectivo',
        fecha_pago:  new Date().toISOString(),
        estatus:     'Completado',
        sucursal_id: form.sucursal_id || null,
      }])
    }

    const paqueteCompleto = paquetes.find(p => p.id === form.paquete_id) as any
    console.log('paquete completo:', paqueteCompleto)
    console.log('max_usuarios:', paqueteCompleto?.max_usuarios)
    if (paqueteCompleto?.max_usuarios === 2 && nuevoCliente) {
      setTitularId(nuevoCliente.id)
      setModalInvitado(true)
      setLoading(false)
      // ← No llamar onSuccess() aquí
      return
    }

    setNuevoId(nuevoCliente?.id || null)
    setLoading(false)
    setToast(true)
    onSuccess()
    onClose()
    resetForm()
  }

  const paqueteSeleccionado = paquetes.find(p => p.id === form.paquete_id)
  const diasRestantes = form.fecha_fin_membresia
    ? Math.max(0, Math.ceil((new Date(form.fecha_fin_membresia).getTime() - Date.now()) / 86400000))
    : null

  return (
    <>
      {toast && (
        <ToastExito
          titulo="Cliente creado"
          mensaje="El cliente se ha dado de alta exitosamente."
          onClose={() => setToast(false)}
          onVer={nuevoId ? () => window.location.href = `/dashboard/clientes/${nuevoId}` : undefined}
        />
      )}

      {/* Modal Invitado — FUERA del drawer */}
      {modalInvitado && titularId && (
        <ModalInvitado
          titularId={titularId}
          onClose={() => { 
            setModalInvitado(false)
            onSuccess()  // ← aquí
            onClose()
            resetForm()
          }}
        />
      )}

      <div onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`} />

      <div className={`fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-black text-gray-900">Nuevo cliente</h2>
            <p className="text-xs text-gray-400 mt-0.5">Alta de cliente</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-400">
            <X size={18}/>
          </button>
        </div>

        {/* Tipo de registro */}
        <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
          <button type="button"
            onClick={() => setTipoRegistro('nuevo')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
              tipoRegistro === 'nuevo' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
            }`}>
            ✨ Nuevo cliente
          </button>
          <button type="button"
            onClick={() => setTipoRegistro('migracion')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
              tipoRegistro === 'migracion' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
            }`}>
            📦 Migración
          </button>
        </div>

        {/* Formulario */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-4">

          {/* Datos personales */}
          <SectionTitle icon={<User size={13}/>}>Datos personales</SectionTitle>

          <Field label="Nombre" required>
            <input placeholder="Nombre" className={inputCls}
              value={form.nombre} onChange={e => set('nombre', e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Primer Apellido" required>
              <input placeholder="Apellido" className={inputCls}
                value={form.primer_apellido} onChange={e => set('primer_apellido', e.target.value)} />
            </Field>
            <Field label="Segundo Apellido">
              <input placeholder="Apellido" className={inputCls}
                value={form.segundo_apellido} onChange={e => set('segundo_apellido', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Correo" required>
              <input type="email" placeholder="nombre@email.com" className={inputCls}
                value={form.email} onChange={e => set('email', e.target.value)} />
            </Field>
            <Field label="Teléfono">
              <input placeholder="Teléfono" className={inputCls}
                value={form.telefono} onChange={e => set('telefono', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de nacimiento">
              <input type="date" className={inputCls}
                value={form.fecha_nacimiento} onChange={e => set('fecha_nacimiento', e.target.value)} />
            </Field>
            <Field label="Sexo">
              <select className={selectCls} value={form.sexo} onChange={e => set('sexo', e.target.value)}>
                <option value="">Seleccionar</option>
                {SEXOS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          {/* Sucursal */}
          <Field label="Sucursal" required>
            <select className={selectCls} value={form.sucursal_id} onChange={e => set('sucursal_id', e.target.value)}>
              <option value="">Seleccionar</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </Field>

          {/* Membresía */}
          <SectionTitle icon={<CreditCard size={13}/>}>Membresía</SectionTitle>

          <Field label="Paquete">
            <select
              className={selectCls}
              value={form.paquete_id}
              onChange={e => set('paquete_id', e.target.value)}
              disabled={!form.sucursal_id}>
              <option value="">
                {!form.sucursal_id ? 'Primero selecciona una sucursal' : 'Seleccionar paquete'}
              </option>
              {paquetes.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={tipoRegistro === 'migracion' ? 'Inicio real' : 'Fecha inicio'}>
              <input type="date" className={inputCls}
                value={form.fecha_inicio_membresia}
                onChange={e => set('fecha_inicio_membresia', e.target.value)} />
            </Field>
            <Field label="Fecha vencimiento">
              <input type="date" className={inputCls}
                value={form.fecha_fin_membresia}
                onChange={e => set('fecha_fin_membresia', e.target.value)} />
            </Field>
          </div>

          {/* Indicador días restantes */}
          {diasRestantes !== null && form.paquete_id && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${
              diasRestantes > 30 ? 'bg-emerald-50 text-emerald-600' :
              diasRestantes > 7  ? 'bg-amber-50 text-amber-600' :
              'bg-red-50 text-red-500'
            }`}>
              <Calendar size={12} />
              {diasRestantes} días restantes de membresía
              {paqueteSeleccionado && ` · ${paqueteSeleccionado.nombre}`}
            </div>
          )}

          <Field label="Forma de pago">
            <select className={selectCls} value={form.forma_pago} onChange={e => set('forma_pago', e.target.value)}>
              <option value="">Seleccionar</option>
              {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>

          {/* Campos extra para migración */}
          {tipoRegistro === 'migracion' && (
            <>
              <SectionTitle icon={<Calendar size={13}/>}>Datos de migración</SectionTitle>
              <Field label="Fecha de alta original">
                <input type="date" className={inputCls}
                  value={form.fecha_alta_original}
                  onChange={e => set('fecha_alta_original', e.target.value)} />
              </Field>
              <Field label="Notas de migración">
                <textarea rows={2} placeholder="Ej: Cliente migrado del sistema anterior, tenía 15 días restantes..."
                  className={`${inputCls} resize-none`}
                  value={form.notas_migracion}
                  onChange={e => set('notas_migracion', e.target.value)} />
              </Field>
            </>
          )}

          {/* Credenciales temporales */}
          <SectionTitle icon={<Lock size={13}/>}>Acceso app</SectionTitle>
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 space-y-1">
            <p className="text-xs text-gray-500">Se generará automáticamente al crear el cliente:</p>
            <p className="text-xs text-gray-700">
              <span className="font-bold">Usuario:</span> {form.email || 'correo del cliente'}
            </p>
            <p className="text-xs text-gray-700">
              <span className="font-bold">Contraseña temporal:</span> NAVY-XXXXXX
            </p>
            <p className="text-[11px] text-amber-600 mt-1">
              ⚠ El cliente deberá cambiar su contraseña en el primer inicio de sesión
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-white">
          <button onClick={() => { onClose(); resetForm() }}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={handleCrear}
            disabled={loading || !form.nombre || !form.email}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition"
            style={{ backgroundColor: '#171B24' }}>
            {loading ? 'Creando...' : tipoRegistro === 'migracion' ? 'Migrar cliente' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </>
  )
}