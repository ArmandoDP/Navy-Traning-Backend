'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useSucursal } from '@/context/SucursalContext'
import PuntoDeVenta    from '@/components/degali/PuntoDeVenta'
import VentasHistorial from '@/components/degali/VentasHistorial'
import InventarioTabla from '@/components/degali/InventarioTabla'
import ProductosTabla  from '@/components/degali/ProductosTabla'

type Tab = 'ventas' | 'historial' | 'inventario' | 'productos'

const TABS = [
  { key: 'ventas',     label: '🛒 Punto de venta' },
  { key: 'historial',  label: '📋 Historial' },
  { key: 'inventario', label: '📦 Inventario' },
  { key: 'productos',  label: '🧃 Productos' },
]

export default function DegaliPage() {
  const { sucursalId, sucursalActiva } = useSucursal()
  const [tab,            setTab]            = useState<Tab>('ventas')
  const [sucursales,     setSucursales]     = useState<any[]>([])
  const [sucursalLocal,  setSucursalLocal]  = useState<string | null>(null)

  useEffect(() => {
    supabase.from('sucursales').select('id, nombre').eq('estatus', 'Activa').order('nombre')
      .then(({ data }) => {
        setSucursales(data || [])
        if (!sucursalId && data && data.length > 0) {
          setSucursalLocal(data[0].id)
        }
      })
  }, [])

  const sucursalEfectiva = sucursalId || sucursalLocal
  const nombreSucursal   = sucursalActiva?.nombre || sucursales.find(s => s.id === sucursalLocal)?.nombre || ''

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">THE GALLEY</h1>
          <p className="text-gray-400 text-sm mt-0.5">Smoothie Bar · {nombreSucursal}</p>
        </div>

        {/* Selector sucursal cuando está en Global */}
        {!sucursalId && sucursales.length > 0 && (
          <select
            className="border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold text-gray-700 outline-none focus:border-gray-400 bg-white"
            value={sucursalLocal || ''}
            onChange={e => setSucursalLocal(e.target.value)}>
            {sucursales.map(s => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as Tab)}
            className={`px-5 py-3 text-sm font-bold border-b-2 transition ${
              tab === t.key
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ventas'     && <PuntoDeVenta   sucursalId={sucursalEfectiva} />}
      {tab === 'historial'  && <VentasHistorial sucursalId={sucursalEfectiva} />}
      {tab === 'inventario' && <InventarioTabla sucursalId={sucursalEfectiva} />}
      {tab === 'productos'  && <ProductosTabla  sucursalId={sucursalEfectiva} />}
    </div>
  )
}