'use client'
import { useState, useEffect } from 'react'
import { supabase }            from '@/lib/supabase'
import { Search, Plus, Minus, Trash2, ShoppingCart, User } from 'lucide-react'
import ModalNuevaVenta from './ModalNuevaVenta'

interface Props { sucursalId: string | null }

function hexSoftBg(hex: string) {
  if (!hex || hex.length < 7) return '#f3f4f6'
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},0.12)`
}

const CATEGORIAS = ['Todos', 'Smoothie', 'Alimento', 'Bebida', 'Snack', 'Suplemento']

export default function PuntoDeVenta({ sucursalId }: Props) {
  const [productos,   setProductos]   = useState<any[]>([])
  const [carrito,     setCarrito]     = useState<any[]>([])
  const [busqueda,    setBusqueda]    = useState('')
  const [categoria,   setCategoria]   = useState('Todos')
  const [modal,       setModal]       = useState(false)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    if (!sucursalId) return
    fetchProductos()
  }, [sucursalId])

  const fetchProductos = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('productos')
      .select(`
        *,
        producto_precios(precio_venta, costo_total, sucursal_id),
        receta_ingredientes(
          cantidad, unidad, es_opcional,
          insumos(nombre),
          insumo_id
        )
      `)
      .eq('activo', true)
      .order('categoria')

    if (data) {
      // Filtrar solo los que tienen precio en esta sucursal
      const filtrados = data.map(p => {
        const precio = p.producto_precios?.find((pp: any) => pp.sucursal_id === sucursalId)
        return { ...p, precio_sucursal: precio?.precio_venta || 0, costo_sucursal: precio?.costo_total || 0 }
      }).filter(p => p.precio_sucursal > 0)
      setProductos(filtrados)
    }
    setLoading(false)
  }

  const productosFiltrados = productos.filter(p => {
    const matchBusqueda  = p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const matchCategoria = categoria === 'Todos' || p.categoria === categoria
    return matchBusqueda && matchCategoria
  })

  const agregarAlCarrito = (producto: any) => {
    setCarrito(prev => {
      const existe = prev.find(i => i.id === producto.id)
      if (existe) return prev.map(i => i.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { ...producto, cantidad: 1 }]
    })
  }

  const cambiarCantidad = (id: string, delta: number) => {
    setCarrito(prev => prev
      .map(i => i.id === id ? { ...i, cantidad: i.cantidad + delta } : i)
      .filter(i => i.cantidad > 0)
    )
  }

  const total = carrito.reduce((a, i) => a + i.precio_sucursal * i.cantidad, 0)

  return (
    <div className="grid grid-cols-3 gap-5 h-[calc(100vh-220px)]">

      {/* Izquierda — catálogo */}
      <div className="col-span-2 flex flex-col gap-4 overflow-hidden">

        {/* Búsqueda + categorías */}
        <div className="space-y-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Buscar producto..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400 bg-white"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>
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
        </div>

        {/* Grid productos */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Cargando...</div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {productosFiltrados.map(p => (
                <button key={p.id} onClick={() => agregarAlCarrito(p)}
                  className="bg-white border border-gray-200 rounded-2xl p-4 text-left hover:border-gray-400 hover:shadow-sm transition group">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      p.tipo === 'con_receta' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {p.categoria}
                    </span>
                    <Plus size={14} className="text-gray-300 group-hover:text-gray-900 transition" />
                  </div>
                  <p className="text-sm font-black text-gray-900 leading-tight mb-1">{p.nombre}</p>
                  <p className="text-lg font-black text-gray-900">${p.precio_sucursal.toLocaleString('es-MX')}</p>
                  {p.tipo === 'con_receta' && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      Costo: ${p.costo_sucursal.toLocaleString('es-MX')}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Derecha — carrito */}
      <div className="bg-white border border-gray-200 rounded-2xl flex flex-col shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <ShoppingCart size={16} className="text-gray-500" />
          <p className="text-sm font-black text-gray-900">Orden actual</p>
          {carrito.length > 0 && (
            <span className="ml-auto text-xs font-bold bg-gray-900 text-white px-2 py-0.5 rounded-full">
              {carrito.reduce((a, i) => a + i.cantidad, 0)}
            </span>
          )}
        </div>

        {carrito.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm italic">
            Agrega productos
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {carrito.map(item => (
              <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{item.nombre}</p>
                  <p className="text-xs text-gray-400">${item.precio_sucursal.toLocaleString('es-MX')} c/u</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => cambiarCantidad(item.id, -1)}
                    className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition">
                    <Minus size={10} />
                  </button>
                  <span className="text-sm font-bold w-4 text-center">{item.cantidad}</span>
                  <button onClick={() => cambiarCantidad(item.id, 1)}
                    className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition">
                    <Plus size={10} />
                  </button>
                  <button onClick={() => setCarrito(prev => prev.filter(i => i.id !== item.id))}
                    className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100 transition ml-1">
                    <Trash2 size={10} className="text-red-500" />
                  </button>
                </div>
                <p className="text-sm font-black text-gray-900 w-14 text-right">
                  ${(item.precio_sucursal * item.cantidad).toLocaleString('es-MX')}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Footer carrito */}
        <div className="px-5 py-4 border-t border-gray-100 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Subtotal</span>
            <span className="text-sm font-bold text-gray-900">${total.toLocaleString('es-MX')}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-base font-black text-gray-900">Total</span>
            <span className="text-xl font-black text-gray-900">${total.toLocaleString('es-MX')}</span>
          </div>
          <button
            onClick={() => setModal(true)}
            disabled={carrito.length === 0}
            className="w-full py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40 transition"
            style={{ backgroundColor: '#171B24' }}>
            Cobrar ${total.toLocaleString('es-MX')} →
          </button>
          {carrito.length > 0 && (
            <button onClick={() => setCarrito([])}
              className="w-full py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-gray-600 transition">
              Vaciar carrito
            </button>
          )}
        </div>
      </div>

      {modal && (
        <ModalNuevaVenta
          carrito={carrito}
          total={total}
          sucursalId={sucursalId}
          onClose={() => setModal(false)}
          onVentaCreada={() => {
            setCarrito([])
            setModal(false)
          }}
        />
      )}
    </div>
  )
}