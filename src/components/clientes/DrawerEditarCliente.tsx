'use client'
import { useState, useEffect } from 'react'
import { supabase }            from '@/lib/supabase'
import { X, User, CreditCard, Lock, Calendar } from 'lucide-react'
import ToastExito              from '@/components/ToastExito'

interface Props {
  isOpen:    boolean
  cliente:   any
  onClose:   () => void
  onSuccess: () => void
}

interface Sucursal { id: string; nombre: string }
interface Paquete  { id: string; nombre: string; vigencia_dias?: number }

const SEXOS       = ['Masculino', 'Femenino', 'Prefiero no decir']
const FORMAS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia', 'OXXO', 'Terminal']
const ESTATUSES   = ['Activo', 'Inactivo', 'Vencido']

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

type Tab = 'datos' | 'membresia' | 'acceso'

export default function DrawerEditarCliente({ isOpen, cliente, onClose, onSuccess }: Props) {
  const [loading,    setLoading]    = useState(false)
  const [toast,      setToast]      = useState(false)
  const [tab,        setTab]        = useState<Tab>('datos')
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [paquetes,   setPaquetes]   = useState<Paquete[]>([])
  const [membresia,  setMembresia]  = useState<any>(null)

  const [form, setForm] = useState({
    nombre:          '',
    primer_apellido: '',
    segundo_apellido:'',
    email:           '',
    telefono:        '',
    fecha_nacimiento:'',
    sexo:            '',
    sucursal_id:     '',
    paquete_id:      '',
    forma_pago:      '',
    estatus:         'Activo',
    nps:             '',
    fecha_alta_original: '',
  })

  const [formMemb, setFormMemb] = useState({
    fecha_inicio: '',
    fecha_fin:    '',
    estatus:      'Activa',
    notas:        '',
  })

  const set     = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))
  const setMemb = (k: string, v: string) => setFormMemb(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!cliente || !isOpen) return
    setTab('datos')

    const partes = cliente.nombre_completo?.split(' ') || []
    setForm({
      nombre:              partes[0] || '',
      primer_apellido:     cliente.primer_apellido  || partes[1] || '',
      segundo_apellido:    cliente.segundo_apellido || partes[2] || '',
      email:               cliente.email            || '',
      telefono:            cliente.telefono         || '',
      fecha_nacimiento:    cliente.fecha_nacimiento?.slice(0,10) || '',
      sexo:                cliente.sexo             || '',
      sucursal_id:         cliente.sucursal_id      || '',
      paquete_id:          cliente.paquete_id       || '',
      forma_pago:          cliente.forma_pago       || '',
      estatus:             cliente.estatus          || 'Activo',
      nps:                 cliente.nps?.toString()  || '',
      fecha_alta_original: cliente.fecha_alta_original?.slice(0,10) || '',
    })

    // Cargar membresía activa
    supabase.from('membresias')
      .select('*, paquetes(nombre)')
      .eq('cliente_id', cliente.id)
      .eq('estatus', 'Activa')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) {
          setMembresia(data)
          setFormMemb({
            fecha_inicio: data.fecha_inicio || '',
            fecha_fin:    data.fecha_fin    || '',
            estatus:      data.estatus      || 'Activa',
            notas:        data.notas        || '',
          })
        } else {
          setMembresia(null)
          setFormMemb({ fecha_inicio: '', fecha_fin: '', estatus: 'Activa', notas: '' })
        }
      })
  }, [cliente, isOpen])

  useEffect(() => {
    if (!isOpen) return
    Promise.all([
      supabase.from('sucursales').select('id, nombre').eq('estatus', 'Activa').order('nombre'),
      supabase.from('paquetes').select('id, nombre, vigencia_dias').eq('estatus', 'Activo').order('nombre'),
    ]).then(([{ data: sucs }, { data: pqs }]) => {
      if (sucs) setSucursales(sucs)
      if (pqs)  setPaquetes(pqs)
    })
  }, [isOpen])

  const diasRestantes = formMemb.fecha_fin
    ? Math.max(0, Math.ceil((new Date(formMemb.fecha_fin).getTime() - Date.now()) / 86400000))
    : null

  const handleGuardar = async () => {
    if (!cliente || !form.nombre || !form.email) return
    setLoading(true)

    const paquete = paquetes.find(p => p.id === form.paquete_id)

    await supabase.from('clientes').update({
      nombre_completo:     `${form.nombre} ${form.primer_apellido} ${form.segundo_apellido}`.trim(),
      primer_apellido:     form.primer_apellido,
      segundo_apellido:    form.segundo_apellido,
      email:               form.email,
      telefono:            form.telefono,
      fecha_nacimiento:    form.fecha_nacimiento || null,
      sexo:                form.sexo,
      sucursal_id:         form.sucursal_id || null,
      paquete_id:          form.paquete_id  || null,
      plan:                paquete?.nombre  || cliente.plan || '',
      forma_pago:          form.forma_pago,
      estatus:             form.estatus,
      nps:                 form.nps ? Number(form.nps) : null,
      fecha_alta_original: form.fecha_alta_original || null,
    }).eq('id', cliente.id)

    // Actualizar membresía si existe
    if (membresia) {
      await supabase.from('membresias').update({
        paquete_id:   form.paquete_id || membresia.paquete_id,
        fecha_inicio: formMemb.fecha_inicio,
        fecha_fin:    formMemb.fecha_fin,
        estatus:      formMemb.estatus,
        notas:        formMemb.notas || null,
      }).eq('id', membresia.id)
    }

    setToast(true)
    onSuccess()
    setLoading(false)
  }

  if (!isOpen || !cliente) return null

  const esMigracion = cliente.origen === 'Migración'

  return (
    <>
      {toast && (
        <ToastExito
          titulo="Cliente actualizado"
          mensaje="Los datos del cliente se actualizaron correctamente."
          onClose={() => setToast(false)}
        />
      )}

      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />

      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-gray-900">Editar cliente</h2>
              {esMigracion && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-600 uppercase tracking-wide">
                  Migración
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{cliente.nombre_completo}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-400">
            <X size={18}/>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {([
            { key: 'datos',    label: '👤 Datos' },
            { key: 'membresia',label: '💳 Membresía' },
            { key: 'acceso',   label: '🔐 Acceso' },
          ] as { key: Tab; label: string }[]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-3 text-xs font-bold transition border-b-2 ${
                tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Tab Datos */}
          {tab === 'datos' && (
            <>
              <SectionTitle icon={<User size={13}/>}>Datos personales</SectionTitle>

              <Field label="Nombre" required>
                <input placeholder="Nombre" className={inputCls}
                  value={form.nombre} onChange={e => set('nombre', e.target.value)} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Primer Apellido">
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
                  <input type="email" className={inputCls}
                    value={form.email} onChange={e => set('email', e.target.value)} />
                </Field>
                <Field label="Teléfono">
                  <input className={inputCls}
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

              <div className="grid grid-cols-2 gap-3">
                <Field label="Sucursal">
                  <select className={selectCls} value={form.sucursal_id} onChange={e => set('sucursal_id', e.target.value)}>
                    <option value="">Seleccionar</option>
                    {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </Field>
                <Field label="Estatus">
                  <select className={selectCls} value={form.estatus} onChange={e => set('estatus', e.target.value)}>
                    {ESTATUSES.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Forma de pago">
                  <select className={selectCls} value={form.forma_pago} onChange={e => set('forma_pago', e.target.value)}>
                    <option value="">Seleccionar</option>
                    {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Field>
                <Field label="NPS (0-10)">
                  <input type="number" min="0" max="10" step="0.1" placeholder="4.3" className={inputCls}
                    value={form.nps} onChange={e => set('nps', e.target.value)} />
                </Field>
              </div>

              {esMigracion && (
                <Field label="Fecha de alta original">
                  <input type="date" className={inputCls}
                    value={form.fecha_alta_original} onChange={e => set('fecha_alta_original', e.target.value)} />
                </Field>
              )}
            </>
          )}

          {/* Tab Membresía */}
          {tab === 'membresia' && (
            <>
              <SectionTitle icon={<CreditCard size={13}/>}>Membresía activa</SectionTitle>

              {!membresia ? (
                <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl px-4 py-6 text-center">
                  <p className="text-sm text-gray-400">Sin membresía activa</p>
                  <p className="text-xs text-gray-300 mt-1">Asigna un paquete para crear una membresía</p>
                </div>
              ) : (
                <>
                  {/* Indicador días */}
                  {diasRestantes !== null && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${
                      diasRestantes > 30 ? 'bg-emerald-50 text-emerald-600' :
                      diasRestantes > 7  ? 'bg-amber-50 text-amber-600' :
                      'bg-red-50 text-red-500'
                    }`}>
                      <Calendar size={12} />
                      {diasRestantes} días restantes
                      {membresia.paquetes?.nombre && ` · ${membresia.paquetes.nombre}`}
                      {esMigracion && (
                        <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-200 text-amber-700">
                          Migración
                        </span>
                      )}
                    </div>
                  )}

                  <Field label="Paquete">
                    <select className={selectCls} value={form.paquete_id} onChange={e => set('paquete_id', e.target.value)}>
                      <option value="">Seleccionar</option>
                      {paquetes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Fecha inicio">
                      <input type="date" className={inputCls}
                        value={formMemb.fecha_inicio} onChange={e => setMemb('fecha_inicio', e.target.value)} />
                    </Field>
                    <Field label="Fecha vencimiento">
                      <input type="date" className={inputCls}
                        value={formMemb.fecha_fin} onChange={e => setMemb('fecha_fin', e.target.value)} />
                    </Field>
                  </div>

                  <Field label="Estatus membresía">
                    <select className={selectCls} value={formMemb.estatus} onChange={e => setMemb('estatus', e.target.value)}>
                      {['Activa','Vencida','Pausada','Cancelada'].map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </Field>

                  <Field label="Notas">
                    <textarea rows={2} placeholder="Notas sobre la membresía..."
                      className={`${inputCls} resize-none`}
                      value={formMemb.notas} onChange={e => setMemb('notas', e.target.value)} />
                  </Field>
                </>
              )}
            </>
          )}

          {/* Tab Acceso */}
          {tab === 'acceso' && (
            <>
              <SectionTitle icon={<Lock size={13}/>}>Credenciales app</SectionTitle>

              <div className="space-y-3">
                <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-500">Usuario</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{cliente.email}</p>
                </div>

                <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 space-y-2">
                  <p className="text-xs font-bold text-gray-500">Contraseña temporal</p>
                  <p className="text-sm font-mono font-bold text-gray-900">
                    {cliente.password_temporal || '—'}
                  </p>
                </div>

                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${
                  cliente.debe_cambiar_password
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-emerald-50 text-emerald-600'
                }`}>
                  {cliente.debe_cambiar_password
                    ? '⚠ Pendiente cambio de contraseña'
                    : '✓ Contraseña actualizada por el cliente'
                  }
                </div>

                {cliente.supabase_user_id && (
                  <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-bold text-gray-500">ID de usuario</p>
                    <p className="text-xs font-mono text-gray-400 mt-0.5 break-all">{cliente.supabase_user_id}</p>
                  </div>
                )}

                <button
                  onClick={async () => {
                    const newPass = 'NAVY-' + Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
                    await supabase.from('clientes').update({
                      password_temporal:     newPass,
                      debe_cambiar_password: true,
                    }).eq('id', cliente.id)
                    alert(`Nueva contraseña temporal: ${newPass}`)
                    onSuccess()
                  }}
                  className="w-full py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition">
                  🔄 Regenerar contraseña temporal
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={loading || !form.nombre || !form.email}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition"
            style={{ backgroundColor: '#171B24' }}>
            {loading ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </>
  )
}