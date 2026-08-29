'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X } from 'lucide-react'

interface Props {
  insumo:     any
  sucursalId: string | null
  onClose:    () => void
  onSuccess:  () => void
}

const MOTIVOS = ['Caducidad', 'Daño', 'Derrame', 'Error de preparación', 'Otro']

export default function ModalMerma({ insumo, sucursalId, onClose, onSuccess }: Props) {
  const [cantidad,  setCantidad]  = useState('')
  const [motivo,    setMotivo]    = useState('')
  const [guardando, setGuardando] = useState(false)

  const handleGuardar = async () => {
    if (!cantidad || !motivo) return
    setGuardando(true)

    await supabase.from('merma').insert({
      sucursal_id: sucursalId,
      insumo_id:   insumo.insumos?.id,
      cantidad:    parseFloat(cantidad),
      motivo,
      fecha:       new Date().toISOString().split('T')[0],
    })

    await supabase
      .from('inventario_insumos')
      .update({
        stock_actual: Math.max(0, insumo.stock_actual - parseFloat(cantidad)),
        updated_at:   new Date().toISOString(),
      })
      .eq('id', insumo.id)

    setGuardando(false)
    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h3 className="text-base font-black text-gray-900">Registrar merma</h3>
            <p className="text-xs text-gray-400 mt-0.5">{insumo.insumos?.nombre}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="bg-amber-50 rounded-xl px-4 py-3 flex justify-between text-sm">
            <span className="text-amber-700">Stock actual</span>
            <span className="font-black text-amber-900">{insumo.stock_actual} {insumo.insumos?.unidad}</span>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Cantidad a restar ({insumo.insumos?.unidad})
            </label>
            <input
              type="number" min="0" max={insumo.stock_actual} placeholder="0"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Motivo</label>
            <div className="flex gap-2 flex-wrap">
              {MOTIVOS.map(m => (
                <button key={m} onClick={() => setMotivo(m)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                    motivo === m ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={handleGuardar}
            disabled={!cantidad || !motivo || guardando}
            className="w-full py-3 rounded-xl text-sm font-black text-white disabled:opacity-40 transition bg-amber-500 hover:bg-amber-600">
            {guardando ? 'Guardando...' : 'Registrar merma'}
          </button>
        </div>
      </div>
    </div>
  )
}