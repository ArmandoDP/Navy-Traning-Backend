'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, AlertTriangle, Plus } from 'lucide-react'
import ModalCompraInsumo from './ModalCompraInsumo'
import ModalMerma from './ModalMerma'

interface Props { sucursalId: string | null }

const CATEGORIAS = ['Todas', 'Frutas', 'Lacteos', 'Proteinas', 'Grasas', 'Panes y Granos', 'Otros', 'Empaques']

export default function InventarioTabla({ sucursalId }: Props) {
  const [insumos,        setInsumos]        = useState<any[]>([])
  const [loading,        setLoading]        = useState(true)
  const [categoria,      setCategoria]      = useState('Todas')
  const [modalCompra,    setModalCompra]    = useState<any>(null)
  const [modalMerma,     setModalMerma]     = useState<any>(null)

  useEffect(() => {
    if (!sucursalId) return
    fetchInsumos()
  }, [sucursalId])

  const fetchInsumos = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('inventario_insumos')
      .select('*, insumos(*)')
      .eq('sucursal_id', sucursalId)
      .order('insumos(categoria)')
    setInsumos(data || [])
    setLoading(false)
  }

  const filtrados = insumos.filter(i =>
    categoria === 'Todas' || i.insumos?.categoria === categoria
  )

  const alertas = insumos.filter(i => i.stock_actual <= i.stock_minimo).length

  return (
    <div className="space-y-4">

      {/* Header alertas */}
      {alertas > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm font-bold text-amber-700">
            {alertas} insumo{alertas > 1 ? 's' : ''} por debajo del stock mínimo
          </p>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2 flex-wrap">
          {CATEGORIAS.map(c => (
            <button key={c} onClick={() => setCategoria(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                categoria === c ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {c}
            </button>
          ))}
        </div>
        <button onClick={fetchInsumos} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
            <RefreshCw size={14} className="animate-spin" /> Cargando...
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="text-gray-400 text-[11px] font-bold uppercase border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-5 py-3">Insumo</th>
                <th className="px-5 py-3">Categoría</th>
                <th className="px-5 py-3">Unidad</th>
                <th className="px-5 py-3 text-right">Stock actual</th>
                <th className="px-5 py-3 text-right">Mínimo</th>
                <th className="px-5 py-3 text-right">Reorden</th>
                <th className="px-5 py-3 text-right">Costo unit.</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrados.map(inv => {
                const bajo = inv.stock_actual <= inv.stock_minimo
                return (
                  <tr key={inv.id} className={`hover:bg-gray-50 transition ${bajo ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        {bajo && <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />}
                        <span className="text-sm font-bold text-gray-900">{inv.insumos?.nombre}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {inv.insumos?.categoria}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{inv.insumos?.unidad}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`text-sm font-black ${bajo ? 'text-amber-600' : 'text-gray-900'}`}>
                        {inv.stock_actual}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm text-gray-400">{inv.stock_minimo}</td>
                    <td className="px-5 py-3.5 text-right text-sm text-gray-400">{inv.stock_reorden}</td>
                    <td className="px-5 py-3.5 text-right text-sm text-gray-500">
                      ${inv.insumos?.costo_unitario?.toFixed(4)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setModalCompra(inv)}
                          className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition">
                          + Compra
                        </button>
                        <button
                          onClick={() => setModalMerma(inv)}
                          className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                          Merma
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalCompra && (
        <ModalCompraInsumo
          insumo={modalCompra}
          sucursalId={sucursalId}
          onClose={() => setModalCompra(null)}
          onSuccess={() => { setModalCompra(null); fetchInsumos() }}
        />
      )}

      {modalMerma && (
        <ModalMerma
          insumo={modalMerma}
          sucursalId={sucursalId}
          onClose={() => setModalMerma(null)}
          onSuccess={() => { setModalMerma(null); fetchInsumos() }}
        />
      )}
    </div>
  )
}