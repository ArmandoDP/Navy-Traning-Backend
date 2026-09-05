'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { X } from 'lucide-react'

interface Props {
  insumo:     any
  sucursalId: string | null
  onClose:    () => void
  onSuccess:  () => void
}

export default function ModalCompraInsumo({ insumo, sucursalId, onClose, onSuccess }: Props) {
  const [unidadesCompradas,  setUnidadesCompradas]  = useState('1')
  const [contenidoPorUnidad, setContenidoPorUnidad] = useState('')
  const [valorCompra,       setValorCompra]       = useState('')
  const [precioUnitario,    setPrecioUnitario]    = useState('0')
  const [notas,             setNotas]             = useState('')
  const [guardando,         setGuardando]         = useState(false)

  const totalGramosML = (parseFloat(unidadesCompradas) || 0) * (parseFloat(contenidoPorUnidad) || 0)

  // ── Cálculo automático dinámico ───────────────────────────────────────────
  useEffect(() => {
    const valorTotal = parseFloat(valorCompra) || 0

    if (totalGramosML > 0 && valorTotal > 0) {
      const unitario = (valorTotal / totalGramosML).toFixed(4)
      setPrecioUnitario(unitario)
    } else {
      setPrecioUnitario('0') // Si no hay valor pagado o cantidad, el costo calculado es 0
    }
  }, [totalGramosML, valorCompra])

  const handleGuardar = async () => {
    const unitarioNum = parseFloat(precioUnitario)
    const valorTotalNum = parseFloat(valorCompra)

    if (totalGramosML <= 0 || valorTotalNum <= 0 || unitarioNum <= 0 || !insumo) return
    setGuardando(true)

    // Registrar compra
    await supabase.from('compras_insumos').insert({
      sucursal_id:     sucursalId,
      insumo_id:       insumo.insumos?.id || insumo.insumo_id,
      cantidad:        totalGramosML,
      precio_unitario: unitarioNum,
      total:           valorTotalNum,
      notas,
      fecha:           new Date().toISOString().split('T')[0],
    })

    // Actualizar stock e insumo base
    await supabase
      .from('inventario_insumos')
      .update({
        stock_actual: (insumo.stock_actual || 0) + totalGramosML,
        updated_at:   new Date().toISOString(),
      })
      .eq('id', insumo.id)

    setGuardando(false)
    onSuccess()
  }

  if (!insumo) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h3 className="text-base font-black text-gray-900">Registrar compra</h3>
            <p className="text-xs text-gray-400 mt-0.5">{insumo.insumos?.nombre || 'Insumo'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-3.5">
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex justify-between text-sm">
            <span className="text-gray-500">Stock actual</span>
            <span className="font-black text-gray-900">{insumo.stock_actual || 0} {insumo.insumos?.unidad || ''}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                Cant. Empaques
              </label>
              <input
                type="number" min="1" placeholder="Ej. 1"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-400"
                value={unidadesCompradas}
                onChange={e => setUnidadesCompradas(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                {insumo.insumos?.unidad || 'g/ml'} por empaque
              </label>
              <input
                type="number" min="1" placeholder="Ej. 500"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-400"
                value={contenidoPorUnidad}
                onChange={e => setContenidoPorUnidad(e.target.value)}
              />
            </div>
          </div>

          {totalGramosML > 0 && (
            <div className="text-xs font-semibold text-gray-500 bg-blue-50/60 text-blue-800 rounded-lg px-3 py-1.5">
              Ingresarán <span className="font-bold">{totalGramosML.toLocaleString('es-MX')} {insumo.insumos?.unidad}</span> en total al inventario.
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
              Costo total pagado ($)
            </label>
            <input
              type="number" min="0" step="0.01" placeholder="Ej. 220.00"
              className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-gray-400"
              value={valorCompra}
              onChange={e => setValorCompra(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                Costo por {insumo.insumos?.unidad || 'unidad'} (calculado)
              </label>
            </div>
            <input
              type="text"
              readOnly
              className="w-full border border-gray-200 bg-gray-50 text-gray-600 font-bold rounded-xl px-4 py-2 text-sm outline-none cursor-not-allowed"
              value={`$${precioUnitario}`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Notas (opcional)</label>
            <input
              placeholder="Proveedor, lote, etc."
              className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-gray-400"
              value={notas}
              onChange={e => setNotas(e.target.value)}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={handleGuardar}
            disabled={totalGramosML <= 0 || parseFloat(valorCompra) <= 0 || guardando}
            className="w-full py-3 rounded-xl text-sm font-black text-white disabled:opacity-40 transition"
            style={{ backgroundColor: '#171B24' }}>
            {guardando ? 'Guardando...' : 'Registrar compra'}
          </button>
        </div>
      </div>
    </div>
  )
}