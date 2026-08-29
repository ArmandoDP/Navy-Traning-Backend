'use client'
import { useState, useRef } from 'react'
import { Upload, Download, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Props { empleado: any; onRefresh: () => void }

const TIPOS_DOC = ['INE', 'Contrato firmado', 'Comprobante de domicilio']

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-xs font-semibold text-gray-800 text-right max-w-[60%]">{value || '—'}</p>
    </div>
  )
}

function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-sm">{icon}</span>
      <p className="text-xs font-black text-gray-700 uppercase tracking-wide">{children}</p>
    </div>
  )
}

export default function StaffTabInfoGeneral({ empleado, onRefresh }: Props) {
  const [uploading, setUploading] = useState<string | null>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const [tipoActivo, setTipoActivo] = useState<string>('')

  const nombreCompleto = `${empleado.nombre} ${empleado.primer_apellido || ''} ${empleado.segundo_apellido || ''}`.trim()

  const antiguedad = (fecha: string) => {
    if (!fecha) return '—'
    const años = Math.floor((Date.now() - new Date(fecha).getTime()) / (1000 * 3600 * 24 * 365))
    if (años === 0) {
      const meses = Math.floor((Date.now() - new Date(fecha).getTime()) / (1000 * 3600 * 24 * 30))
      return `${meses} ${meses === 1 ? 'mes' : 'meses'}`
    }
    return `${años} ${años === 1 ? 'año' : 'años'}`
  }

  const handleSubirDoc = async (file: File, tipo: string) => {
    setUploading(tipo)
    const ext      = file.name.split('.').pop()
    const path     = `${empleado.id}/${tipo.replace(/ /g, '_')}_${Date.now()}.${ext}`

    const { data: storageData, error: storageError } = await supabase.storage
      .from('staff-documentos')
      .upload(path, file, { upsert: true })

    if (storageError) { alert('Error subiendo archivo: ' + storageError.message); setUploading(null); return }

    const { data: urlData } = supabase.storage.from('staff-documentos').getPublicUrl(path)

    // Borrar doc previo del mismo tipo si existe
    await supabase.from('staff_documentos')
      .delete()
      .eq('staff_id', empleado.id)
      .eq('tipo', tipo)

    await supabase.from('staff_documentos').insert({
      staff_id:       empleado.id,
      tipo,
      url:            urlData.publicUrl,
      nombre_archivo: file.name,
    })

    setUploading(null)
    onRefresh()
  }

  const handleEliminarDoc = async (docId: string, url: string) => {
    if (!confirm('¿Eliminar este documento?')) return
    // Extraer path del URL
    const path = url.split('/staff-documentos/')[1]
    if (path) await supabase.storage.from('staff-documentos').remove([path])
    await supabase.from('staff_documentos').delete().eq('id', docId)
    onRefresh()
  }

  const docPorTipo = (tipo: string) =>
    empleado.staff_documentos?.find((d: any) => d.tipo === tipo)

  return (
    <div className="px-6 py-5 space-y-6">

      {/* Datos personales */}
      <div>
        <SectionTitle icon="👤">Datos personales</SectionTitle>
        <div className="bg-gray-50 rounded-2xl px-4">
          <InfoRow label="Nombre completo"  value={nombreCompleto} />
          <InfoRow label="Email"            value={empleado.email} />
          <InfoRow label="Teléfono"         value={empleado.telefono} />
          <InfoRow label="Fecha de ingreso" value={empleado.fecha_ingreso
            ? new Date(empleado.fecha_ingreso).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
            : '—'} />
          <InfoRow label="Antigüedad"       value={antiguedad(empleado.fecha_ingreso)} />
          {empleado.rfc_identificacion &&
            <InfoRow label="RFC"            value={empleado.rfc_identificacion} />
          }
        </div>
      </div>

      {/* Bio pública — solo coaches */}
      {empleado.tipo === 'Coach' && empleado.bio && (
        <div>
          <SectionTitle icon="📝">Bio Pública</SectionTitle>
          <div className="bg-gray-50 rounded-2xl px-4 py-3">
            <p className="text-[10px] text-gray-400 mb-1 italic">
              (Se muestra en la app a clientes)
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{empleado.bio}</p>
            <p className="text-[10px] text-gray-400 mt-2">
              Todos los clientes ven nombre, foto y bio solo en las clases que impartes
            </p>
          </div>
        </div>
      )}

      {/* Documentos */}
      <div>
        <SectionTitle icon="📄">Documentos</SectionTitle>
        <div className="bg-gray-50 rounded-2xl px-4 py-2 space-y-0 divide-y divide-gray-100">
          {TIPOS_DOC.map(tipo => {
            const doc = docPorTipo(tipo)
            return (
              <div key={tipo} className="flex items-center justify-between py-3">
                <p className="text-xs font-semibold text-gray-700">{tipo}</p>
                <div className="flex items-center gap-2">
                  {doc ? (
                    <>
                      <span className="text-[11px] font-bold text-emerald-500">✓ Entregado</span>
                      <a href={doc.url} target="_blank" rel="noreferrer"
                        className="p-1 hover:bg-gray-200 rounded-lg text-gray-400 hover:text-gray-600 transition">
                        <Download size={12} />
                      </a>
                      <button onClick={() => handleEliminarDoc(doc.id, doc.url)}
                        className="p-1 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-400 transition">
                        <Trash2 size={12} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] text-gray-300">Pendiente</span>
                      <button
                        onClick={() => { setTipoActivo(tipo); inputRef.current?.click() }}
                        disabled={uploading === tipo}
                        className="flex items-center gap-1 text-[11px] font-bold text-indigo-500 hover:text-indigo-700 transition">
                        {uploading === tipo
                          ? 'Subiendo...'
                          : <><Upload size={11} /> Subir</>
                        }
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file && tipoActivo) handleSubirDoc(file, tipoActivo)
            e.target.value = ''
          }}
        />
        {empleado.staff_documentos?.length > 0 && (
          <button
            onClick={() => {
              empleado.staff_documentos.forEach((d: any) => window.open(d.url, '_blank'))
            }}
            className="mt-2 flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition">
            <Download size={12} /> Descargar todos
          </button>
        )}
      </div>

      {/* Banco para nómina */}
      <div>
        <SectionTitle icon="🏦">Banco para nómina</SectionTitle>
        <div className="bg-gray-50 rounded-2xl px-4">
          <InfoRow label="Banco"   value={empleado.banco} />
          <InfoRow label="CLABE"   value={empleado.clabe || empleado.cuenta_bancaria} />
          <InfoRow label="Titular" value={empleado.titular_cuenta || nombreCompleto} />
        </div>
      </div>

      {/* Contacto de emergencia */}
      {(empleado.contacto_emergencia_nombre || empleado.contacto_emergencia_telefono) && (
        <div>
          <SectionTitle icon="🚨">Contacto de emergencia</SectionTitle>
          <div className="bg-gray-50 rounded-2xl px-4">
            <InfoRow label="Nombre"   value={empleado.contacto_emergencia_nombre} />
            <InfoRow label="Relación" value={empleado.contacto_emergencia_relacion} />
            <InfoRow label="Teléfono" value={empleado.contacto_emergencia_telefono} />
          </div>
        </div>
      )}
    </div>
  )
}