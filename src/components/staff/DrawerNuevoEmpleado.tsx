'use client'
import { useState, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ModalReglaBono from './ModalReglaBono'
import ToastExito from '@/components/ToastExito'

interface Props {
  isOpen:    boolean
  onClose:   () => void
  onSuccess: () => void
}

interface Sucursal { id: string; nombre: string; color: string }

const TIPOS      = ['Coach', 'Manager', 'Submanager', 'Regional', 'Front', 'Staff general']
const NIVELES    = ['Marine', 'Seal', 'Elite']
const CATEGORIAS = ['HYROX', 'Hybrid', 'Calistenia', 'Force', 'Open Gym', 'Movement', 'Recovery', 'Nutrición']

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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 pt-2">{children}</h3>
}

export default function DrawerNuevoEmpleado({ isOpen, onClose, onSuccess }: Props) {
  const [loading,          setLoading]          = useState(false)
  const [sucursales,       setSucursales]        = useState<Sucursal[]>([])
  const [modalBonoOpen,    setModalBonoOpen]     = useState(false)
  const [reglaEditando,    setReglaEditando]     = useState<any>(null)
  const [toast, setToast] = useState(false)
  const [docs, setDocs] = useState<{ tipo: string; file: File | null }[]>([
    { tipo: 'INE',                      file: null },
    { tipo: 'Contrato firmado',         file: null },
    { tipo: 'Comprobante de domicilio', file: null },
  ])

  // reglas temporales (antes de crear el staff)
  const [reglasTemp, setReglasTemp] = useState<any[]>([])

  const [form, setForm] = useState({
    nombre:           '',
    primer_apellido:  '',
    segundo_apellido: '',
    rfc:              '',
    email:            '',
    telefono:         '',
    fecha_ingreso:    '',
    estatus:          'Activo',
    tipo:             '',
    // Coach only
    nivel:            '',
    categorias:       [] as string[],
    sucursales_ids:   [] as string[],
    // Compensación
    tarifa_hora:      '',
    sueldo_fijo:      '',
    // Reglas de bono → se manejan aparte en reglasTemp
    aplica_bono_puntualidad: false,
    pago_en_efectivo:        false,
    // Bancario
    banco:            '',
    cuenta_bancaria:  '',
    // Bio
    bio:              '',
    // Contactos de emergencia
    contacto_emergencia_nombre:   '',
    contacto_emergencia_relacion: '',
    contacto_emergencia_telefono: '',
  })

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const isCoach = form.tipo === 'Coach'

  const toggleCategoria = (c: string) => {
    set('categorias', form.categorias.includes(c)
      ? form.categorias.filter(x => x !== c)
      : [...form.categorias, c])
  }

  const toggleSucursal = (id: string) => {
    set('sucursales_ids', form.sucursales_ids.includes(id)
      ? form.sucursales_ids.filter(x => x !== id)
      : [...form.sucursales_ids, id])
  }

  useEffect(() => {
    if (!isOpen) return
    supabase.from('sucursales').select('id, nombre, color')
      .eq('estatus', 'Activa').order('nombre')
      .then(({ data }) => { if (data) setSucursales(data) })
  }, [isOpen])

  const handleGuardar = async () => {
    if (!form.nombre || !form.tipo) return
    setLoading(true)
    setToast(true)
    onSuccess()
    handleClose()

    // 1. Crear staff
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .insert({
        nombre:                  form.nombre,
        primer_apellido:         form.primer_apellido,
        segundo_apellido:        form.segundo_apellido,
        rfc_identificacion:      form.rfc,
        email:                   form.email,
        telefono:                form.telefono,
        fecha_ingreso:           form.fecha_ingreso || null,
        estatus:                 form.estatus,
        tipo:                    form.tipo,
        nivel:                   isCoach ? form.nivel || null : null,
        tarifa_hora:             form.tarifa_hora ? Number(form.tarifa_hora) : null,
        sueldo_fijo:             form.sueldo_fijo ? Number(form.sueldo_fijo) : null,
        aplica_bono_puntualidad: form.aplica_bono_puntualidad,
        pago_en_efectivo:        form.pago_en_efectivo,
        banco:                   form.banco,
        cuenta_bancaria:         form.cuenta_bancaria,
        bio:                     form.bio,
        contacto_emergencia_nombre:   form.contacto_emergencia_nombre,
        contacto_emergencia_relacion: form.contacto_emergencia_relacion,
        contacto_emergencia_telefono: form.contacto_emergencia_telefono,
      })
      .select()
      .single()

    if (staffError || !staffData) {
      alert('Error al crear staff: ' + staffError?.message)
      setLoading(false)
      return
    }

    const staffId = staffData.id

    // 2. Sucursales asignadas
    if (form.sucursales_ids.length > 0) {
      await supabase.from('staff_sucursales').insert(
        form.sucursales_ids.map(sid => ({ staff_id: staffId, sucursal_id: sid }))
      )
    }

    // 3. Categorías (solo coach)
    if (isCoach && form.categorias.length > 0) {
      await supabase.from('staff_categorias').insert(
        form.categorias.map(cat => ({ staff_id: staffId, categoria: cat }))
      )
    }

    // 4. Reglas de bono temporales
    if (reglasTemp.length > 0) {
      await supabase.from('staff_reglas_bono').insert(
        reglasTemp.map(r => ({ ...r, staff_id: staffId }))
      )
    }

    // 5. Subir documentos
    for (const doc of docs) {
      if (!doc.file) continue
      const ext  = doc.file.name.split('.').pop()
      const path = `${staffId}/${doc.tipo.replace(/ /g, '_')}_${Date.now()}.${ext}`
      const { data: storageData } = await supabase.storage
        .from('staff-documentos')
        .upload(path, doc.file, { upsert: true })
      const { data: urlData } = supabase.storage
        .from('staff-documentos').getPublicUrl(path)
      await supabase.from('staff_documentos').insert({
        staff_id:       staffId,
        tipo:           doc.tipo,
        url:            urlData.publicUrl,
        nombre_archivo: doc.file.name,
      })
    }

    setLoading(false)
    onSuccess()
    handleClose()
  }

  const handleClose = () => {
    setForm({
      nombre: '', primer_apellido: '', segundo_apellido: '', rfc: '',
      email: '', telefono: '', fecha_ingreso: '', estatus: 'Activo', tipo: '',
      nivel: '', categorias: [], sucursales_ids: [],
      tarifa_hora: '', sueldo_fijo: '',
      aplica_bono_puntualidad: false, pago_en_efectivo: false,
      banco: '', cuenta_bancaria: '', bio: '',
      contacto_emergencia_nombre: '',
      contacto_emergencia_relacion: '',
      contacto_emergencia_telefono: '',
    })
    setReglasTemp([])
    onClose()
  }

  // Guardar regla temporal (sin staffId aún)
  const handleGuardarReglaTemp = (regla: any) => {
    if (reglaEditando?._tempId !== undefined) {
      setReglasTemp(prev => prev.map(r => r._tempId === reglaEditando._tempId ? { ...regla, _tempId: r._tempId } : r))
    } else {
      setReglasTemp(prev => [...prev, { ...regla, _tempId: Date.now() }])
    }
    setReglaEditando(null)
    setModalBonoOpen(false)
  }

  const eliminarReglaTemp = (tempId: number) =>
    setReglasTemp(prev => prev.filter(r => r._tempId !== tempId))

  if (!isOpen) return null

  return (
    <>
      {toast && (
        <ToastExito
            titulo="Nuevo miembro del staff creado"
            mensaje="El empleado se ha dado de alta exitosamente."
            onClose={() => setToast(false)}
        />
        )}
      {/* Overlay */}
      <div onClick={handleClose} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />

      {/* Drawer */}
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-black text-gray-900">Nuevo empleado</h2>
            <p className="text-xs text-gray-400 mt-0.5">Alta del staff con su tipo, sucursales y compensación.</p>
          </div>
          <button onClick={handleClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-400">
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Datos personales ── */}
          <SectionTitle>Datos personales</SectionTitle>

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
            <Field label="Correo">
              <input type="email" placeholder="correo@email.com" className={inputCls}
                value={form.email} onChange={e => set('email', e.target.value)} />
            </Field>
            <Field label="Teléfono">
              <input placeholder="Teléfono" className={inputCls}
                value={form.telefono} onChange={e => set('telefono', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de ingreso">
              <input type="date" className={inputCls}
                value={form.fecha_ingreso} onChange={e => set('fecha_ingreso', e.target.value)} />
            </Field>
            <Field label="Estatus">
              <select className={selectCls} value={form.estatus} onChange={e => set('estatus', e.target.value)}>
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </Field>
          </div>

          <Field label="RFC / Identificación">
            <input placeholder="RFC" className={inputCls}
              value={form.rfc} onChange={e => set('rfc', e.target.value)} />
          </Field>

          {/* ── Tipo de miembro ── */}
          <SectionTitle>Tipo de miembro</SectionTitle>

          <div className="flex flex-wrap gap-2">
            {TIPOS.map(t => (
              <button key={t} onClick={() => set('tipo', t)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  form.tipo === t
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                }`}>
                {form.tipo === t && <span className="mr-1">✓</span>}
                {t}
              </button>
            ))}
          </div>

          {/* ── Secciones exclusivas de Coach ── */}
          {isCoach && (
            <>
              {/* Sucursales asignadas */}
              <SectionTitle>Sucursales asignadas</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {sucursales.map(s => (
                  <button key={s.id} onClick={() => toggleSucursal(s.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      form.sucursales_ids.includes(s.id)
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                    }`}>
                    {form.sucursales_ids.includes(s.id) && <span className="mr-1">✓</span>}
                    {s.nombre}
                  </button>
                ))}
              </div>

              {/* Nivel del coach */}
              <SectionTitle>Nivel del coach</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {NIVELES.map(n => (
                  <button key={n} onClick={() => set('nivel', form.nivel === n ? '' : n)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      form.nivel === n
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                    }`}>
                    {form.nivel === n && <span className="mr-1">✓</span>}
                    {n}
                  </button>
                ))}
              </div>

              {/* Categorías que imparte */}
              <SectionTitle>Categorías que imparte</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {CATEGORIAS.map(cat => (
                  <button key={cat} onClick={() => toggleCategoria(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      form.categorias.includes(cat)
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                    }`}>
                    {form.categorias.includes(cat) && <span className="mr-1">✓</span>}
                    {cat}
                  </button>
                ))}
              </div>

              {/* Reglas de bono */}
              <SectionTitle>Reglas de bono</SectionTitle>
              {reglasTemp.length > 0 && (
                <div className="space-y-2">
                  {reglasTemp.map(r => (
                    <div key={r._tempId}
                      className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
                      <div>
                        <p className="text-xs font-bold text-gray-800">{r.categoria}</p>
                        <p className="text-[11px] text-gray-400">
                          {r.niveles?.join(', ')} · ≥{r.min_asistentes} asist. · ${r.monto_bono}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setReglaEditando(r); setModalBonoOpen(true) }}
                          className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">
                          Editar
                        </button>
                        <button onClick={() => eliminarReglaTemp(r._tempId)}
                          className="text-xs text-red-400 hover:text-red-600 font-medium">
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => { setReglaEditando(null); setModalBonoOpen(true) }}
                className="flex items-center gap-2 text-sm font-bold text-gray-700 border border-dashed border-gray-200 rounded-xl px-4 py-2.5 hover:bg-gray-50 transition w-full justify-center">
                <Plus size={14} /> Agregar regla de bono
              </button>
            </>
          )}

          {/* ── Compensación ── */}
          <SectionTitle>Compensación</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tarifa por hora">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" placeholder="0" className={`${inputCls} pl-6`}
                  value={form.tarifa_hora} onChange={e => set('tarifa_hora', e.target.value)} />
              </div>
            </Field>
            <Field label="Sueldo fijo (opcional)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" placeholder="0" className={`${inputCls} pl-6`}
                  value={form.sueldo_fijo} onChange={e => set('sueldo_fijo', e.target.value)} />
              </div>
            </Field>
          </div>

          {/* Reglas adicionales */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div onClick={() => set('aplica_bono_puntualidad', !form.aplica_bono_puntualidad)}
                className={`w-10 h-5 rounded-full transition-colors relative ${form.aplica_bono_puntualidad ? 'bg-gray-900' : 'bg-gray-200'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.aplica_bono_puntualidad ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-gray-700">
                Aplica bono por puntualidad <span className="text-gray-400 text-xs">(aplica bono si llega antes de 5 min de la clase)</span>
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <div onClick={() => set('pago_en_efectivo', !form.pago_en_efectivo)}
                className={`w-10 h-5 rounded-full transition-colors relative ${form.pago_en_efectivo ? 'bg-gray-900' : 'bg-gray-200'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.pago_en_efectivo ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-gray-700">Acepta pago en efectivo</span>
            </label>
          </div>

          {/* ── Documentación bancaria ── */}
          <SectionTitle>Documentación bancaria</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Banco">
              <input placeholder="Seleccionar" className={inputCls}
                value={form.banco} onChange={e => set('banco', e.target.value)} />
            </Field>
            <Field label="Cuenta bancaria">
              <input placeholder="0000 0000 0000 0000" className={inputCls}
                value={form.cuenta_bancaria} onChange={e => set('cuenta_bancaria', e.target.value)} />
            </Field>
          </div>

          {/* ── Documentos ── */}
          <SectionTitle>Documentos</SectionTitle>
          <div className="space-y-3">
            {docs.map((doc, i) => (
              <div key={doc.tipo} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                <p className="text-sm font-medium text-gray-700">{doc.tipo}</p>
                <div className="flex items-center gap-2">
                  {doc.file
                    ? <>
                        <span className="text-[11px] text-emerald-500 font-bold">✓ {doc.file.name}</span>
                        <button onClick={() => setDocs(prev => prev.map((d, j) => j === i ? { ...d, file: null } : d))}
                          className="text-[11px] text-red-400 hover:text-red-600 font-medium">
                          Quitar
                        </button>
                      </>
                    : <label className="flex items-center gap-1 text-[11px] font-bold text-indigo-500 hover:text-indigo-700 cursor-pointer transition">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Subir
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) setDocs(prev => prev.map((d, j) => j === i ? { ...d, file } : d))
                            e.target.value = ''
                          }} />
                      </label>
                  }
                </div>
              </div>
            ))}
          </div>

          {/* ── Contacto de emergencia ── */}
          <SectionTitle>Contacto de emergencia</SectionTitle>
          <Field label="Nombre">
            <input placeholder="Nombre completo" className={inputCls}
              value={form.contacto_emergencia_nombre}
              onChange={e => set('contacto_emergencia_nombre', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Relación">
              <input placeholder="Ej: Padre, Madre" className={inputCls}
                value={form.contacto_emergencia_relacion}
                onChange={e => set('contacto_emergencia_relacion', e.target.value)} />
            </Field>
            <Field label="Teléfono">
              <input placeholder="Teléfono" className={inputCls}
                value={form.contacto_emergencia_telefono}
                onChange={e => set('contacto_emergencia_telefono', e.target.value)} />
            </Field>
          </div>

          {/* ── Bio ── */}
          <SectionTitle>Bio (Opcional)</SectionTitle>
          <textarea rows={3} placeholder="Breve descripción del trayectoria"
            className={`${inputCls} resize-none`}
            value={form.bio} onChange={e => set('bio', e.target.value)} />

        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={handleClose}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={loading || !form.nombre || !form.tipo}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition"
            style={{ backgroundColor: '#171B24' }}>
            {loading ? 'Creando...' : 'Crear empleado'}
          </button>
        </div>
      </div>

      {/* Modal de regla de bono (modo temporal) */}
      {modalBonoOpen && (
        <ModalReglaBonoPrev
          isOpen={modalBonoOpen}
          regla={reglaEditando}
          onClose={() => { setModalBonoOpen(false); setReglaEditando(null) }}
          onGuardar={handleGuardarReglaTemp}
        />
      )}
    </>
  )
}

// ── Versión del modal de bono para uso TEMPORAL (sin guardar en DB) ──────────
function ModalReglaBonoPrev({
  isOpen, regla, onClose, onGuardar,
}: {
  isOpen: boolean; regla: any; onClose: () => void; onGuardar: (r: any) => void
}) {
  const [categoria,     setCategoria]     = useState<string>(regla?.categoria || '')
  const [nivelesSelect, setNivelesSelect] = useState<string[]>(regla?.niveles || [])
  const [minAsistentes, setMinAsistentes] = useState<number>(regla?.min_asistentes || 0)
  const [montoBono,     setMontoBono]     = useState<number>(regla?.monto_bono || 0)

  const toggleNivel = (n: string) =>
    setNivelesSelect(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])

  const canSave = categoria && nivelesSelect.length > 0

  const preview = canSave
    ? `Si la clase es ${categoria} y el coach es ${nivelesSelect.join(', ')} y los asistentes son ≥ ${minAsistentes} entonces paga bono de $${montoBono}`
    : null

  if (!isOpen) return null

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto">

          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
            <h2 className="text-base font-black text-gray-900">Nueva regla de bono</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition">
              <X size={16} />
            </button>
          </div>

          <div className="px-6 py-5 space-y-6">

            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-800">Si la clase es<span className="text-red-500">*</span></p>
              <p className="text-xs text-gray-400">Selecciona una clase</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIAS.map(cat => (
                  <button key={cat} onClick={() => setCategoria(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      categoria === cat ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                    }`}>
                    {categoria === cat && <span className="mr-1">✓</span>}{cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100" />

            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-800">y el coach es<span className="text-red-500">*</span></p>
              <p className="text-xs text-gray-400">Selecciona uno o varios Nivel/es</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Lead', tarifa: 180 }, { label: 'Junior', tarifa: 240 },
                  { label: 'Marine', tarifa: 320 }, { label: 'Semi-senior', tarifa: 360 },
                  { label: 'Senior', tarifa: 400 }, { label: 'Elite', tarifa: 450 },
                ].map(n => (
                  <button key={n.label} onClick={() => toggleNivel(n.label)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      nivelesSelect.includes(n.label) ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                    }`}>
                    {nivelesSelect.includes(n.label) && <span className="mr-1">✓</span>}
                    {n.label} — ${n.tarifa}/h
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100" />

            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700 font-medium">y asistentes ≥</span>
                <button onClick={() => setMinAsistentes(p => Math.max(0, p - 1))}
                  className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500">
                  <svg width="10" height="2" viewBox="0 0 10 2" fill="none"><rect width="10" height="2" rx="1" fill="currentColor"/></svg>
                </button>
                <span className="w-10 text-center text-sm font-bold text-gray-900">{minAsistentes}</span>
                <button onClick={() => setMinAsistentes(p => p + 1)}
                  className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 0V10M0 5H10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700 font-medium">paga bono de</span>
                <button onClick={() => setMontoBono(p => Math.max(0, p - 10))}
                  className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500">
                  <svg width="10" height="2" viewBox="0 0 10 2" fill="none"><rect width="10" height="2" rx="1" fill="currentColor"/></svg>
                </button>
                <span className="w-16 text-center text-sm font-bold text-gray-900">${montoBono}</span>
                <button onClick={() => setMontoBono(p => p + 10)}
                  className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 0V10M0 5H10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs text-gray-400 font-medium">👁 Vista previa de la regla</p>
              {preview
                ? <p className="text-sm text-gray-700">{preview}</p>
                : <p className="text-sm text-gray-400 italic">Si la clase es [Selecciona Categoría] y el coach es [Selecciona Nivel/es] y los asistentes son ≥ [Número] entonces paga bono de [$ Monto]</p>
              }
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            {regla?._tempId
              ? <button onClick={() => { /* handled outside */ onClose() }} className="text-xs text-red-500 hover:text-red-700 font-medium">Eliminar regla</button>
              : <div />
            }
            <div className="flex gap-3">
              <button onClick={onClose}
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={() => onGuardar({ categoria, niveles: nivelesSelect, min_asistentes: minAsistentes, monto_bono: montoBono })}
                disabled={!canSave}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition"
                style={{ backgroundColor: '#171B24' }}>
                Crear regla
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}