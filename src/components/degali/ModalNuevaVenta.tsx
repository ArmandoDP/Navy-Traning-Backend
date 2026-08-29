'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Search, User } from 'lucide-react'
import { Resend } from 'resend'

interface Props {
  carrito:       any[]
  total:         number
  sucursalId:    string | null
  onClose:       () => void
  onVentaCreada: () => void
}

export default function ModalNuevaVenta({ carrito, total, sucursalId, onClose, onVentaCreada }: Props) {
  const [metodoPago,      setMetodoPago]      = useState<'efectivo' | 'terminal'>('efectivo')
  const [numeroOperacion, setNumeroOperacion] = useState('')
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [clienteSel,      setClienteSel]      = useState<any>(null)
  const [clientes,        setClientes]        = useState<any[]>([])
  const [buscando,        setBuscando]        = useState(false)
  const [procesando,      setProcesando]      = useState(false)

  const buscarCliente = async (q: string) => {
    setBusquedaCliente(q)
    if (q.length < 2) { setClientes([]); return }
    setBuscando(true)
    const { data } = await supabase
      .from('clientes')
      .select('id, nombre_completo, email')
      .or(`nombre_completo.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(5)
    setClientes(data || [])
    setBuscando(false)
  }

  const handleCobrar = async () => {
    if (metodoPago === 'terminal' && !numeroOperacion) return
    setProcesando(true)

    // 1. Crear venta
    const { data: venta } = await supabase.from('ventas').insert({
      sucursal_id:      sucursalId,
      cliente_id:       clienteSel?.id || null,
      total,
      metodo_pago:      metodoPago,
      numero_operacion: numeroOperacion || null,
      estatus:          'Completada',
    }).select().single()

    if (!venta) { setProcesando(false); return }

    // 2. Crear items
    await supabase.from('venta_items').insert(
      carrito.map(i => ({
        venta_id:        venta.id,
        producto_id:     i.id,
        cantidad:        i.cantidad,
        precio_unitario: i.precio_sucursal,
        subtotal:        i.precio_sucursal * i.cantidad,
      }))
    )

    // 3. Descontar inventario de insumos para productos con receta
    for (const item of carrito) {
      if (item.tipo !== 'con_receta') continue
      for (let q = 0; q < item.cantidad; q++) {
        for (const ing of (item.receta_ingredientes || [])) {
          await supabase.rpc('decrementar_inventario', {
            p_insumo_id:   ing.insumo_id,
            p_sucursal_id: sucursalId,
            p_cantidad:    ing.cantidad,
          })
        }
      }
      // Descontar inventario productos simples
      if (item.tipo === 'simple') {
        await supabase.rpc('decrementar_inventario_producto', {
          p_producto_id:  item.id,
          p_sucursal_id:  sucursalId,
          p_cantidad:     item.cantidad,
        })
      }
    }

    // 4. Mandar comprobante por correo si hay cliente
    if (clienteSel?.email) {
      await fetch('/api/degali/comprobante', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ventaId:         venta.id,
          email:           clienteSel.email,
          nombre:          clienteSel.nombre_completo,
          carrito,
          total,
          metodoPago,
          numeroOperacion,
          sucursalId,
        }),
      })
    }

    setProcesando(false)
    onVentaCreada()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md z-10 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h3 className="text-lg font-black text-gray-900">Cobrar orden</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Resumen */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-3">Resumen</p>
            {carrito.map(i => (
              <div key={i.id} className="flex justify-between text-sm">
                <span className="text-gray-600">{i.nombre} ×{i.cantidad}</span>
                <span className="font-bold text-gray-900">${(i.precio_sucursal * i.cantidad).toLocaleString('es-MX')}</span>
              </div>
            ))}
            <div className="border-t border-gray-200 pt-2 flex justify-between">
              <span className="font-black text-gray-900">Total</span>
              <span className="text-xl font-black text-gray-900">${total.toLocaleString('es-MX')}</span>
            </div>
          </div>

          {/* Cliente */}
          <div className="space-y-2">
            <p className="text-xs font-black text-gray-500 uppercase tracking-wide">Cliente</p>
            {clienteSel ? (
              <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                <User size={16} className="text-indigo-500" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-indigo-900">{clienteSel.nombre_completo}</p>
                  <p className="text-xs text-indigo-500">{clienteSel.email}</p>
                </div>
                <button onClick={() => { setClienteSel(null); setBusquedaCliente('') }}
                  className="text-indigo-400 hover:text-indigo-600">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  placeholder="Buscar cliente (opcional)..."
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400"
                  value={busquedaCliente}
                  onChange={e => buscarCliente(e.target.value)}
                />
                {clientes.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 z-10 overflow-hidden">
                    {clientes.map(c => (
                      <button key={c.id} onClick={() => { setClienteSel(c); setClientes([]) }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left text-sm">
                        <User size={14} className="text-gray-400" />
                        <div>
                          <p className="font-bold text-gray-900">{c.nombre_completo}</p>
                          <p className="text-xs text-gray-400">{c.email}</p>
                        </div>
                      </button>
                    ))}
                    <button onClick={() => { setClientes([]); setBusquedaCliente('') }}
                      className="w-full px-4 py-2.5 text-xs text-gray-400 hover:bg-gray-50 border-t border-gray-100">
                      Continuar sin cliente
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Método de pago */}
          <div className="space-y-2">
            <p className="text-xs font-black text-gray-500 uppercase tracking-wide">Método de pago</p>
            <div className="grid grid-cols-2 gap-2">
              {(['efectivo', 'terminal'] as const).map(m => (
                <button key={m} onClick={() => setMetodoPago(m)}
                  className={`py-3 rounded-xl text-sm font-bold border-2 transition capitalize ${
                    metodoPago === m ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}>
                  {m === 'efectivo' ? '💵 Efectivo' : '💳 Terminal'}
                </button>
              ))}
            </div>
            {metodoPago === 'terminal' && (
              <input
                placeholder="Número de operación *"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400"
                value={numeroOperacion}
                onChange={e => setNumeroOperacion(e.target.value)}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={handleCobrar}
            disabled={procesando || (metodoPago === 'terminal' && !numeroOperacion)}
            className="w-full py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40 transition"
            style={{ backgroundColor: '#171B24' }}>
            {procesando ? 'Procesando...' : `Confirmar pago $${total.toLocaleString('es-MX')}`}
          </button>
        </div>
      </div>
    </div>
  )
}