'use client'
import { useState } from 'react'
import { X, Minus, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Props {
  isOpen:    boolean
  staffId:   string
  regla?:    any   // si viene, es edición
  onClose:   () => void
  onSuccess: () => void
}

const CATEGORIAS = ['HYROX', 'Hybrid', 'Calistenia', 'Force', 'Open Gym', 'Movement', 'Recovery', 'Nutrición']
const NIVELES: { label: string; tarifa: number }[] = [
  { label: 'Lead',        tarifa: 180 },
  { label: 'Junior',      tarifa: 240 },
  { label: 'Marine',      tarifa: 320 },
  { label: 'Semi-senior', tarifa: 360 },
  { label: 'Senior',      tarifa: 400 },
  { label: 'Elite',       tarifa: 450 },
]

export default function ModalReglaBono({ isOpen, staffId, regla, onClose, onSuccess }: Props) {
  const [loading,        setLoading]        = useState(false)
  const [categoria,      setCategoria]      = useState<string>(regla?.categoria || '')
  const [nivelesSelect,  setNivelesSelect]  = useState<string[]>(regla?.niveles || [])
  const [minAsistentes,  setMinAsistentes]  = useState<number>(regla?.min_asistentes || 0)
  const [montoBono,      setMontoBono]      = useState<number>(regla?.monto_bono || 0)

  const toggleNivel = (n: string) =>
    setNivelesSelect(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])

  const canSave = categoria && nivelesSelect.length > 0

  const handleGuardar = async () => {
    if (!canSave) return
    setLoading(true)

    const payload = {
      staff_id:       staffId,
      categoria,
      niveles:        nivelesSelect,
      min_asistentes: minAsistentes,
      monto_bono:     montoBono,
    }

    let error
    if (regla?.id) {
      ({ error } = await supabase.from('staff_reglas_bono').update(payload).eq('id', regla.id))
    } else {
      ({ error } = await supabase.from('staff_reglas_bono').insert(payload))
    }

    if (error) { alert('Error: ' + error.message); setLoading(false); return }
    onSuccess()
    onClose()
    setLoading(false)
  }

  const handleEliminar = async () => {
    if (!regla?.id) return
    if (!confirm('¿Eliminar esta regla?')) return
    await supabase.from('staff_reglas_bono').delete().eq('id', regla.id)
    onSuccess()
    onClose()
  }

  if (!isOpen) return null

  const preview = (() => {
    if (!canSave) return null
    const nivelesStr = nivelesSelect.join(', ')
    return `Si la clase es ${categoria} y el coach es ${nivelesStr} y los asistentes son ≥ ${minAsistentes} entonces paga bono de $${montoBono}`
  })()

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto">

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
            <h2 className="text-base font-black text-gray-900">Nueva regla de bono</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition">
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-6">

            {/* Si la clase es */}
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-800">
                Si la clase es<span className="text-red-500">*</span>
              </p>
              <p className="text-xs text-gray-400">Selecciona una clase</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIAS.map(cat => (
                  <button key={cat} onClick={() => setCategoria(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      categoria === cat
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                    }`}>
                    {categoria === cat && <span className="mr-1">✓</span>}
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* y el coach es */}
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-800">
                y el coach es<span className="text-red-500">*</span>
              </p>
              <p className="text-xs text-gray-400">Selecciona uno o varios Nivel/es</p>
              <div className="flex flex-wrap gap-2">
                {NIVELES.map(n => (
                  <button key={n.label} onClick={() => toggleNivel(n.label)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      nivelesSelect.includes(n.label)
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                    }`}>
                    {nivelesSelect.includes(n.label) && <span className="mr-1">✓</span>}
                    {n.label} — ${n.tarifa}/h
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Asistentes y monto */}
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700 font-medium">y asistentes ≥</span>
                <button onClick={() => setMinAsistentes(p => Math.max(0, p - 1))}
                  className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500 transition">
                  <Minus size={12} />
                </button>
                <span className="w-10 text-center text-sm font-bold text-gray-900">{minAsistentes}</span>
                <button onClick={() => setMinAsistentes(p => p + 1)}
                  className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500 transition">
                  <Plus size={12} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700 font-medium">paga bono de</span>
                <button onClick={() => setMontoBono(p => Math.max(0, p - 10))}
                  className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500 transition">
                  <Minus size={12} />
                </button>
                <span className="w-16 text-center text-sm font-bold text-gray-900">${montoBono}</span>
                <button onClick={() => setMontoBono(p => p + 10)}
                  className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500 transition">
                  <Plus size={12} />
                </button>
              </div>
            </div>

            {/* Vista previa */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                <span>👁</span> Vista previa de la regla
              </div>
              {preview
                ? <p className="text-sm text-gray-700 leading-snug"
                    dangerouslySetInnerHTML={{ __html: preview
                      .replace(categoria, `<strong>${categoria}</strong>`)
                      .replace(nivelesSelect.join(', '), `<strong>${nivelesSelect.join(', ')}</strong>`)
                      .replace(`$ ${montoBono}`, `<strong>$ ${montoBono}</strong>`)
                    }} />
                : <p className="text-sm text-gray-400 italic">
                    Si la clase es [Selecciona Categoría] y el coach es [Selecciona Nivel/es] y los asistentes son ≥ [Número] entonces paga bono de [$ Monto]
                  </p>
              }
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            {regla?.id
              ? <button onClick={handleEliminar} className="text-xs text-red-500 hover:text-red-700 font-medium transition">
                  Eliminar regla
                </button>
              : <div />
            }
            <div className="flex gap-3">
              <button onClick={onClose}
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={handleGuardar} disabled={!canSave || loading}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition"
                style={{ backgroundColor: '#171B24' }}>
                {loading ? 'Guardando...' : 'Crear regla'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}