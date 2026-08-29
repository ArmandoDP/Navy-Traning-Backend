'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw } from 'lucide-react'

interface Props { sucursalId: string | null }

export default function VentasHistorial({ sucursalId }: Props) {
  const [ventas,   setVentas]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!sucursalId) return
    fetchVentas()
  }, [sucursalId])

  const fetchVentas = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ventas')
      .select(`
        *,
        clientes(nombre_completo),
        staff(nombre, primer_apellido),
        venta_items(cantidad, precio_unitario, subtotal, productos(nombre))
      `)
      .eq('sucursal_id', sucursalId)
      .order('created_at', { ascending: false })
      .limit(50)
    setVentas(data || [])
    setLoading(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
      <RefreshCw size={14} className="animate-spin" /> Cargando...
    </div>
  )

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-black text-gray-900">Historial de ventas</p>
        <button onClick={fetchVentas} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
          <RefreshCw size={14} />
        </button>
      </div>

      {ventas.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm italic">No hay ventas registradas</div>
      ) : (
        <table className="w-full text-left">
          <thead className="text-gray-400 text-[11px] font-bold uppercase border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="px-5 py-3">Folio</th>
              <th className="px-5 py-3">Fecha</th>
              <th className="px-5 py-3">Cliente</th>
              <th className="px-5 py-3">Productos</th>
              <th className="px-5 py-3">Pago</th>
              <th className="px-5 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {ventas.map(v => (
              <tr key={v.id} className="hover:bg-gray-50 transition">
                <td className="px-5 py-3.5">
                  <span className="text-xs font-mono font-bold text-gray-500">
                    #{v.id.slice(0,8).toUpperCase()}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600">
                  {new Date(v.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-700">
                  {v.clientes?.nombre_completo || <span className="text-gray-300 italic">Genérico</span>}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {v.venta_items?.slice(0,2).map((i: any, idx: number) => (
                      <span key={idx} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {i.cantidad}× {i.productos?.nombre}
                      </span>
                    ))}
                    {v.venta_items?.length > 2 && (
                      <span className="text-[11px] text-gray-400">+{v.venta_items.length - 2} más</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    v.metodo_pago === 'efectivo' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'
                  }`}>
                    {v.metodo_pago === 'efectivo' ? '💵 Efectivo' : '💳 Terminal'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right font-black text-gray-900">
                  ${v.total.toLocaleString('es-MX')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}