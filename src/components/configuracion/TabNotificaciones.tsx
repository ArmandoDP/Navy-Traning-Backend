'use client'
import { useEffect, useState } from 'react'
import { supabase }            from '@/lib/supabase'
import { Bell, Mail, MessageSquare, Edit2, Send } from 'lucide-react'

interface Props { onNuevaNotificacion?: () => void }
interface Props { abrirModal?: boolean; onModalCerrado?: () => void }

const TIPOS_LABEL: Record<string, { label: string; sub: string }> = {
  modificacion_clase:    { label: 'Modificación de clase',           sub: 'Cambio de coach, hora o salón' },
  clase_cancelada:       { label: 'Clase cancelada',                 sub: 'Cancelación masiva por feriado/evento' },
  paquete_por_vencer:    { label: 'Paquete por vencer',              sub: 'Recordatorio antes de expirar' },
  pago_fallido:          { label: 'Pago fallido',                    sub: 'Reintentar cobro o actualizar método' },
  recuperacion_clientes: { label: 'Recuperación de clientes perdidos', sub: 'Reactivación con descuento' },
  recordatorio_clase:    { label: 'Recordatorio de clase',           sub: 'Enviado el día anterior' },
}

export default function TabNotificaciones({ abrirModal, onModalCerrado }: Props) {
  const [configs,        setConfigs]        = useState<any[]>([])
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState<string | null>(null)
  const [modalEnviar,    setModalEnviar]    = useState(false)
  const [clientes,       setClientes]       = useState<any[]>([])
  const [form,           setForm]           = useState({ titulo: '', mensaje: '', segmento: 'todos' })
  const [enviando,       setEnviando]       = useState(false)
  const [editando,       setEditando]       = useState<any | null>(null)

  useEffect(() => {
    Promise.all([
        supabase.from('notificaciones_config').select('*').order('created_at'),
        supabase.from('clientes').select('id, nombre_completo, estatus').eq('estatus', 'Activo').order('nombre_completo'),
    ]).then(([{ data: c, error: e1 }, { data: cl, error: e2 }]) => {
        console.log('configs:', c, 'error:', e1)
        console.log('clientes:', cl, 'error:', e2)
        if (c)  setConfigs(c)
        if (cl) setClientes(cl)
        setLoading(false)
    })
    }, [])
    
  useEffect(() => {
    if (abrirModal) {
        setModalEnviar(true)
        onModalCerrado?.()
    }
    }, [abrirModal])

  const handleToggle = async (id: string, campo: string, valor: boolean) => {
    setSaving(id + campo)
    await supabase.from('notificaciones_config').update({ [campo]: valor }).eq('id', id)
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, [campo]: valor } : c))
    setSaving(null)
  }

  const handleGuardarPlantilla = async () => {
    if (!editando) return
    await supabase.from('notificaciones_config').update({
      titulo:  editando.titulo,
      mensaje: editando.mensaje,
    }).eq('id', editando.id)
    setConfigs(prev => prev.map(c => c.id === editando.id ? { ...c, ...editando } : c))
    setEditando(null)
  }

  const handleEnviarManual = async () => {
    if (!form.titulo || !form.mensaje) return
    setEnviando(true)

    let clienteIds: string[] = []
    if (form.segmento === 'todos') {
      clienteIds = clientes.map(c => c.id)
    } else {
      clienteIds = clientes.filter(c => c.estatus === form.segmento).map(c => c.id)
    }

    await fetch('/api/notificaciones/push', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ titulo: form.titulo, mensaje: form.mensaje, cliente_ids: clienteIds, filtro: 'manual' }),
    })

    setEnviando(false)
    setModalEnviar(false)
    setForm({ titulo: '', mensaje: '', segmento: 'todos' })
  }

  const Toggle = ({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) => (
    <button onClick={onChange} disabled={disabled}
      className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-gray-200'} disabled:opacity-40`}>
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  )

  if (loading) return <div className="p-10 text-center text-gray-400 italic text-sm">Cargando...</div>

  return (
    <div className="space-y-5">

      {/* Modal editar plantilla */}
      {editando && (
        <>
          <div onClick={() => setEditando(null)} className="fixed inset-0 z-40 bg-black/20" />
          <div className="fixed top-0 right-0 z-50 h-full w-96 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <p className="text-sm font-black text-gray-900">Editar plantilla</p>
                <p className="text-xs text-gray-400">{TIPOS_LABEL[editando.tipo]?.label}</p>
              </div>
              <button onClick={() => setEditando(null)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">✕</button>
            </div>
            <div className="flex-1 px-6 py-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Título</label>
                <input className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400 bg-gray-50"
                  value={editando.titulo || ''}
                  onChange={e => setEditando((p: any) => ({ ...p, titulo: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Mensaje</label>
                <textarea rows={4}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400 bg-gray-50 resize-none"
                  value={editando.mensaje || ''}
                  onChange={e => setEditando((p: any) => ({ ...p, mensaje: e.target.value }))} />
                <p className="text-xs text-gray-400">Variables: {'{clase}'}, {'{fecha}'}, {'{hora}'}, {'{paquete}'}</p>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setEditando(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleGuardarPlantilla}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ backgroundColor: '#171B24' }}>
                Guardar
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal enviar manual */}
      {modalEnviar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-black text-gray-900">Nueva notificación</h2>
              <button onClick={() => setModalEnviar(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Título</label>
                <input className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400 bg-gray-50"
                  placeholder="Título de la notificación"
                  value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Mensaje</label>
                <textarea rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400 bg-gray-50 resize-none"
                  placeholder="Mensaje de la notificación..."
                  value={form.mensaje} onChange={e => setForm(p => ({ ...p, mensaje: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Destinatarios</label>
                <select className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none bg-gray-50 appearance-none"
                  value={form.segmento} onChange={e => setForm(p => ({ ...p, segmento: e.target.value }))}>
                  <option value="todos">Todos los clientes activos</option>
                  <option value="Activo">Solo activos</option>
                  <option value="Inactivo">Solo inactivos</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setModalEnviar(false)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleEnviarManual} disabled={enviando || !form.titulo || !form.mensaje}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ backgroundColor: '#171B24' }}>
                <Send size={14} /> {enviando ? 'Enviando...' : 'Enviar notificación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="text-xs font-bold text-gray-400 uppercase border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3 text-center">Push</th>
              <th className="px-5 py-3 text-center">Email</th>
              <th className="px-5 py-3 text-center">SMS</th>
              <th className="px-5 py-3 text-center">Plantilla</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {configs.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 transition">
                <td className="px-5 py-4">
                  <p className="text-sm font-bold text-gray-900">{TIPOS_LABEL[c.tipo]?.label || c.tipo}</p>
                  <p className="text-xs text-gray-400">{TIPOS_LABEL[c.tipo]?.sub}</p>
                </td>
                <td className="px-5 py-4 text-center">
                  <div className="flex justify-center">
                    <Toggle
                      checked={c.push}
                      onChange={() => handleToggle(c.id, 'push', !c.push)}
                      disabled={saving === c.id + 'push'}
                    />
                  </div>
                </td>
                <td className="px-5 py-4 text-center">
                  <div className="flex justify-center">
                    <Toggle
                      checked={c.email}
                      onChange={() => handleToggle(c.id, 'email', !c.email)}
                      disabled={saving === c.id + 'email'}
                    />
                  </div>
                </td>
                <td className="px-5 py-4 text-center">
                  <div className="flex justify-center">
                    <Toggle
                      checked={c.sms}
                      onChange={() => handleToggle(c.id, 'sms', !c.sms)}
                      disabled={saving === c.id + 'sms'}
                    />
                  </div>
                </td>
                <td className="px-5 py-4 text-center">
                  <button onClick={() => setEditando(c)}
                    className="flex items-center gap-1.5 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition mx-auto">
                    <Edit2 size={12} /> Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}