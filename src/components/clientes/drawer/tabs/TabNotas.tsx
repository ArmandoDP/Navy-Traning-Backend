'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Check, MoreVertical, X } from 'lucide-react'

interface Nota {
  id: string; autor: string; rol: string; contenido: string
  tags: string[]; created_at: string
  clases?: { nombre_clase: string; sucursales?: { nombre: string } }
}

interface Props {
  clienteId: string
  notas:     Nota[]
  onRefresh: () => void
}

const TAGS_NOTAS    = ['VIP', 'Lesión hombro', 'Riesgo churn', 'Lesión rodilla', 'Upgrade target']
const ROL_COLORS: Record<string, string> = {
  Front: 'bg-pink-100 text-pink-700',
  Coach: 'bg-blue-100 text-blue-700',
  Admin: 'bg-purple-100 text-purple-700',
}

export default function TabNotas({ clienteId, notas, onRefresh }: Props) {
  const [contenido, setContenido] = useState('')
  const [tagsActivos, setTagsActivos] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const toggleTag = (t: string) =>
    setTagsActivos(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const handleGuardar = async () => {
    if (!contenido.trim()) return
    setSaving(true)
    await supabase.from('notas_cliente').insert([{
      cliente_id: clienteId,
      autor:      'Admin',
      rol:        'Front',
      contenido:  contenido.trim(),
      tags:       tagsActivos,
    }])
    setContenido(''); setTagsActivos([]); onRefresh(); setSaving(false)
  }

  const handleEliminar = async (id: string) => {
    await supabase.from('notas_cliente').delete().eq('id', id)
    onRefresh()
  }

  return (
    <div className="space-y-5">
      {/* Editor nueva nota */}
      <div className="border border-gray-200 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-gray-500">Notas</p>
        <input
          placeholder="Nueva nota*"
          className="w-full text-sm font-bold text-gray-900 outline-none placeholder:text-gray-300 bg-transparent border-b border-gray-100 pb-2"
          value={contenido}
          onChange={e => setContenido(e.target.value)}
        />
        <textarea
          placeholder="Escribe una nota sobre el cliente"
          rows={3}
          className="w-full text-sm text-gray-700 outline-none bg-transparent resize-none placeholder:text-gray-300"
          value={contenido}
          onChange={e => setContenido(e.target.value)}
        />
        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {TAGS_NOTAS.map(t => (
            <button key={t} onClick={() => toggleTag(t)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                tagsActivos.includes(t)
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'border-gray-200 text-gray-600 hover:border-gray-400'
              }`}>
              {t}
            </button>
          ))}
          <button className="px-2.5 py-1 rounded-full text-[11px] font-bold border border-dashed border-gray-300 text-gray-400 hover:border-gray-500 transition">
            + Agregar tag
          </button>
        </div>
        <div className="flex justify-end">
          <button onClick={handleGuardar} disabled={saving || !contenido.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40 transition"
            style={{ backgroundColor: '#171B24' }}>
            <Check size={12}/> Guardar nota
          </button>
        </div>
      </div>

      {/* Lista notas */}
      <div>
        <p className="text-xs font-bold text-gray-500 mb-3">Notas del equipo</p>
        <div className="space-y-3">
          {notas.length === 0 ? (
            <p className="text-xs text-gray-400 italic text-center py-4">Sin notas registradas</p>
          ) : notas.map(n => (
            <div key={n.id} className="border border-gray-100 rounded-2xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">{n.autor}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ROL_COLORS[n.rol] || 'bg-gray-100 text-gray-500'}`}>
                    {n.rol}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">
                    {new Date(n.created_at).toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' })}
                  </span>
                  <button onClick={() => handleEliminar(n.id)} className="text-gray-300 hover:text-red-400 transition">
                    <MoreVertical size={14}/>
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{n.contenido}</p>
              {n.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {n.tags.map(t => (
                    <span key={t} className="px-2 py-0.5 bg-gray-100 rounded-full text-[10px] font-medium text-gray-600">{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}