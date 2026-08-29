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

export default function ModalCompraInsumo({ insumo, sucursalId, onClose, onSuccess }: Props) {
  const [cantidad,       setCantidad]       = useState('')
  const [precioUnitario, setPrecioUnitario] = useState(insumo.insumos?.precio_compra || '')
  const [notas,          setNotas]          = useState('')
  const [guardando,      setGuardando]      = useState(false)

  const total = (parseFloat(cantidad) || 0) * (parseFloat(precioUnitario) || 0)

  const handleGuardar = async () => {
    if (!cantidad || !precioUnitario) return
    setGuardando(true)

    // Registrar compra
    await supabase.from('compras_insumos').insert({
      sucursal_id:    sucursalId,
      insumo_id:      insumo.insumos?.id,
      cantidad:       parseFloat(cantidad),
      precio_unitario: parseFloat(precioUnitario),
      total,
      notas,
      fecha:          new Date().toISOString().split('T')[0],
    })

    // Actualizar stock
    await supabase
      .from('inventario_insumos')
      .update({
        stock_actual: insumo.stock_actual + parseFloat(cantidad),
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
            <h3 className="text-base font-black text-gray-900">Registrar compra</h3>
            <p className="text-xs text-gray-400 mt-0.5">{insumo.insumos?.nombre}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex justify-between text-sm">
            <span className="text-gray-500">Stock actual</span>
            <span className="font-black text-gray-900">{insumo.stock_actual} {insumo.insumos?.unidad}</span>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Cantidad a agregar ({insumo.insumos?.unidad})
            </label>
            <input
              type="number" min="0" placeholder="0"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Precio unitario</label>
            <input
              type="number" min="0" step="0.01"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400"
              value={precioUnitario}
              onChange={e => setPrecioUnitario(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Notas (opcional)</label>
            <input
              placeholder="Proveedor, lote, etc."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400"
              value={notas}
              onChange={e => setNotas(e.target.value)}
            />
          </div>

          {cantidad && precioUnitario && (
            <div className="bg-gray-900 rounded-xl px-4 py-3 flex justify-between">
              <span className="text-gray-400 text-sm">Total compra</span>
              <span className="text-white font-black">${total.toLocaleString('es-MX')}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={handleGuardar}
            disabled={!cantidad || !precioUnitario || guardando}
            className="w-full py-3 rounded-xl text-sm font-black text-white disabled:opacity-40 transition"
            style={{ backgroundColor: '#171B24' }}>
            {guardando ? 'Guardando...' : 'Registrar compra'}
          </button>
        </div>
      </div>
    </div>
  )
}