'use client'
import { useState, useEffect, useRef } from 'react'
import { X, Upload, Trash2 }           from 'lucide-react'
import { supabase }                    from '@/lib/supabase'
import ToastExito                      from '@/components/ToastExito'

interface Props {
  isOpen:     boolean
  gerente?:   any
  sucursales: { id: string; nombre: string; color: string }[]
  onClose:    () => void
  onSuccess:  () => void
}

const TIPOS_DOC = ['INE', 'Contrato firmado', 'Comprobante de domicilio']

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

function hexSoftBg(hex: string) {
  if (!hex || hex.length < 7) return '#f3f4f6'
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},0.12)`
}

export default function DrawerGerente({ isOpen, gerente, sucursales, onClose, onSuccess }: Props) {
  const [loading,   setLoading]   = useState(false)
  const [toast,     setToast]     = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [docs,      setDocs]      = useState<{ tipo: string; file: File | null; url?: string; docId?: string }[]>([
    { tipo: 'INE',                      file: null },
    { tipo: 'Contrato firmado',         file: null },
    { tipo: 'Comprobante de domicilio', file: null },
  ])
  const fotoRef    = useRef<HTMLInputElement>(null)
  const docRef     = useRef<HTMLInputElement>(null)
  const [tipoDocActivo, setTipoDocActivo] = useState('')

  const [form, setForm] = useState({
    nombre:                       '',
    primer_apellido:              '',
    segundo_apellido:             '',
    email:                        '',
    telefono:                     '',
    fecha_ingreso:                '',
    estatus:                      'Activo',
    sucursal_asignada_id:         '',
    sueldo_fijo:                  '',
    banco:                        '',
    cuenta_bancaria:              '',
    clabe:                        '',
    contacto_emergencia_nombre:   '',
    contacto_emergencia_relacion: '',
    contacto_emergencia_telefono: '',
    foto_url:                     '',
  })

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!isOpen) return

    if (gerente) {
      setForm({
        nombre:                       gerente.nombre || '',
        primer_apellido:              gerente.primer_apellido || '',
        segundo_apellido:             gerente.segundo_apellido || '',
        email:                        gerente.email || '',
        telefono:                     gerente.telefono || '',
        fecha_ingreso:                gerente.fecha_ingreso?.slice(0,10) || '',
        estatus:                      gerente.estatus || 'Activo',
        sucursal_asignada_id:         gerente.sucursal_asignada_id || '',
        sueldo_fijo:                  gerente.sueldo_fijo?.toString() || '',
        banco:                        gerente.banco || '',
        cuenta_bancaria:              gerente.cuenta_bancaria || '',
        clabe:                        gerente.clabe || '',
        contacto_emergencia_nombre:   gerente.contacto_emergencia_nombre || '',
        contacto_emergencia_relacion: gerente.contacto_emergencia_relacion || '',
        contacto_emergencia_telefono: gerente.contacto_emergencia_telefono || '',
        foto_url:                     gerente.foto_url || '',
      })

      // Cargar docs existentes
      supabase.from('staff_documentos').select('*').eq('staff_id', gerente.id)
        .then(({ data }) => {
          if (data) setDocs(prev => prev.map(d => {
            const found = data.find((sd: any) => sd.tipo === d.tipo)
            return found ? { ...d, url: found.url, docId: found.id } : d
          }))
        })
    } else {
      setForm({
        nombre: '', primer_apellido: '', segundo_apellido: '',
        email: '', telefono: '', fecha_ingreso: '', estatus: 'Activo',
        sucursal_asignada_id: '', sueldo_fijo: '', banco: '',
        cuenta_bancaria: '', clabe: '',
        contacto_emergencia_nombre: '', contacto_emergencia_relacion: '',
        contacto_emergencia_telefono: '', foto_url: '',
      })
      setDocs([
        { tipo: 'INE', file: null },
        { tipo: 'Contrato firmado', file: null },
        { tipo: 'Comprobante de domicilio', file: null },
      ])
    }
  }, [isOpen, gerente])

  const handleSubirFoto = async (file: File) => {
    const ext  = file.name.split('.').pop()
    const path = `gerentes/${gerente?.id || Date.now()}/foto.${ext}`
    await supabase.storage.from('staff-documentos').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('staff-documentos').getPublicUrl(path)
    set('foto_url', data.publicUrl)
  }

  const handleSubirDoc = async (file: File, tipo: string, staffId: string) => {
    setUploading(tipo)
    const ext  = file.name.split('.').pop()
    const path = `${staffId}/${tipo.replace(/ /g, '_')}_${Date.now()}.${ext}`
    await supabase.storage.from('staff-documentos').upload(path, file, { upsert: true })
    const { data: urlData } = supabase.storage.from('staff-documentos').getPublicUrl(path)
    await supabase.from('staff_documentos').delete().eq('staff_id', staffId).eq('tipo', tipo)
    await supabase.from('staff_documentos').insert({ staff_id: staffId, tipo, url: urlData.publicUrl, nombre_archivo: file.name })
    setUploading(null)
  }

  const handleGuardar = async () => {
    if (!form.nombre) return
    setLoading(true)

    const payload = {
      nombre:                       form.nombre,
      primer_apellido:              form.primer_apellido,
      segundo_apellido:             form.segundo_apellido,
      email:                        form.email,
      telefono:                     form.telefono,
      fecha_ingreso:                form.fecha_ingreso || null,
      estatus:                      form.estatus,
      tipo:                         'Manager',
      sucursal_asignada_id:         form.sucursal_asignada_id || null,
      sueldo_fijo:                  form.sueldo_fijo ? Number(form.sueldo_fijo) : null,
      banco:                        form.banco,
      cuenta_bancaria:              form.cuenta_bancaria,
      clabe:                        form.clabe,
      contacto_emergencia_nombre:   form.contacto_emergencia_nombre,
      contacto_emergencia_relacion: form.contacto_emergencia_relacion,
      contacto_emergencia_telefono: form.contacto_emergencia_telefono,
      foto_url:                     form.foto_url || null,
    }

    let staffId = gerente?.id

    if (gerente) {
      await supabase.from('staff').update(payload).eq('id', gerente.id)
    } else {
      const { data } = await supabase.from('staff').insert(payload).select().single()
      staffId = data?.id
    }

    // Subir documentos nuevos
    if (staffId) {
      for (const doc of docs) {
        if (!doc.file) continue
        await handleSubirDoc(doc.file, doc.tipo, staffId)
      }

      // Si se asignó sucursal, actualizar campo gerente en sucursal
      if (form.sucursal_asignada_id) {
        await supabase.from('sucursales')
          .update({ gerente: `${form.nombre} ${form.primer_apellido}`.trim() })
          .eq('id', form.sucursal_asignada_id)
      }
    }

    setLoading(false)
    setToast(true)
    onSuccess()
  }

  if (!isOpen) return null

  return (
    <>
      {toast && (
        <ToastExito
          titulo={gerente ? 'Gerente actualizado' : 'Gerente creado'}
          mensaje={gerente ? 'Los cambios se guardaron correctamente.' : 'El gerente se dio de alta exitosamente.'}
          onClose={() => setToast(false)}
        />
      )}

      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />

      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-black text-gray-900">
              {gerente ? 'Editar gerente' : 'Nuevo gerente'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {gerente ? `${gerente.nombre} ${gerente.primer_apellido}` : 'Alta de nuevo gerente'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-400">
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Foto */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0 border border-gray-200">
              {form.foto_url
                ? <img src={form.foto_url} alt="" className="w-full h-full object-cover" />
                : <span className="text-2xl font-black text-gray-400">{form.nombre?.charAt(0) || '?'}</span>
              }
            </div>
            <div>
              <button onClick={() => fotoRef.current?.click()}
                className="flex items-center gap-2 text-sm font-bold text-indigo-500 hover:text-indigo-700 transition">
                <Upload size={14} /> {form.foto_url ? 'Cambiar foto' : 'Subir foto'}
              </button>
              <p className="text-[11px] text-gray-400 mt-0.5">JPG, PNG o WEBP · máx 5MB</p>
              <input ref={fotoRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleSubirFoto(f); e.target.value = '' }} />
            </div>
          </div>

          {/* Datos personales */}
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

          {/* Sucursal asignada */}
          <SectionTitle>Sucursal asignada</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {sucursales.map(s => (
              <button key={s.id} type="button"
                onClick={() => set('sucursal_asignada_id', form.sucursal_asignada_id === s.id ? '' : s.id)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border transition"
                style={form.sucursal_asignada_id === s.id
                  ? { backgroundColor: s.color, color: '#fff', borderColor: s.color }
                  : { backgroundColor: hexSoftBg(s.color), color: s.color, borderColor: 'transparent' }
                }>
                {form.sucursal_asignada_id === s.id && '✓ '}{s.nombre}
              </button>
            ))}
          </div>
          {!form.sucursal_asignada_id && (
            <p className="text-[11px] text-gray-400 italic">Sin sucursal asignada</p>
          )}

          {/* Compensación */}
          <SectionTitle>Compensación</SectionTitle>
          <Field label="Sueldo fijo">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" placeholder="0" className={`${inputCls} pl-6`}
                value={form.sueldo_fijo} onChange={e => set('sueldo_fijo', e.target.value)} />
            </div>
          </Field>

          {/* Banco */}
          <SectionTitle>Documentación bancaria</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Banco">
              <input placeholder="Banco" className={inputCls}
                value={form.banco} onChange={e => set('banco', e.target.value)} />
            </Field>
            <Field label="Cuenta bancaria">
              <input placeholder="0000 0000 0000 0000" className={inputCls}
                value={form.cuenta_bancaria} onChange={e => set('cuenta_bancaria', e.target.value)} />
            </Field>
          </div>
          <Field label="CLABE">
            <input placeholder="18 dígitos" className={inputCls}
              value={form.clabe} onChange={e => set('clabe', e.target.value)} />
          </Field>

          {/* Documentos */}
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
                          className="text-[11px] text-red-400 hover:text-red-600 font-medium">Quitar</button>
                      </>
                    : doc.url
                      ? <>
                          <span className="text-[11px] text-emerald-500 font-bold">✓ Entregado</span>
                          <a href={doc.url} target="_blank" rel="noreferrer"
                            className="text-[11px] text-gray-400 hover:text-gray-600 font-medium">Ver</a>
                          <label className="text-[11px] font-bold text-indigo-500 hover:text-indigo-700 cursor-pointer transition">
                            Reemplazar
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0]
                                if (file) setDocs(prev => prev.map((d, j) => j === i ? { ...d, file } : d))
                                e.target.value = ''
                              }} />
                          </label>
                        </>
                      : <label className="flex items-center gap-1 text-[11px] font-bold text-indigo-500 hover:text-indigo-700 cursor-pointer transition">
                          <Upload size={11} /> Subir
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

          {/* Contacto de emergencia */}
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

          {/* Eliminar */}
          {gerente && (
            <button onClick={async () => {
              if (!confirm('¿Eliminar este gerente?')) return
              await supabase.from('staff').delete().eq('id', gerente.id)
              onSuccess()
            }}
              className="flex items-center gap-2 text-red-500 hover:text-red-600 text-sm font-medium transition pt-2">
              <Trash2 size={15} /> Eliminar gerente
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={loading || !form.nombre}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition"
            style={{ backgroundColor: '#171B24' }}>
            {loading ? 'Guardando...' : gerente ? 'Guardar cambios' : 'Crear gerente'}
          </button>
        </div>
      </div>
    </>
  )
}