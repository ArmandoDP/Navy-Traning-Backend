'use client'
import { Pencil, Star } from 'lucide-react'

interface Cliente {
  id: string
  nombre_completo: string
  email: string
  telefono?: string
  estatus: string
  plan?: string
  valor_cliente?: number
  visitas?: number
  nps?: number
  sucursales?: { nombre: string; color: string }
  pagos?: any[]
  reservas?: any[]
}

interface Props {
  cliente: Cliente
  reservas: any[]
  onRefresh: () => Promise<void> 
  onEditar: (cliente: any) => void
  noShows:    number
}

const SUCURSAL_COLORS: Record<string, string> = {
  Juriquilla: '#6366f1', Refugio: '#f97316',
  Lomas: '#22c55e',     Interlomas: '#3b82f6',
}

function getSucursalColor(nombre: string) {
  const key = Object.keys(SUCURSAL_COLORS).find(k => nombre?.includes(k))
  return key ? SUCURSAL_COLORS[key] : '#6366f1'
}

export default function DrawerClienteHeader({ cliente, onEditar, noShows, onRefresh, reservas }: Props) {
  const sucNombre = cliente.sucursales?.nombre || ''
  const sucColor  = getSucursalColor(sucNombre)

  return (
    <div className="px-6 pt-5 pb-4 border-b border-gray-100">
      {/* Nombre + editar */}
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-xl font-black text-gray-900">{cliente.nombre_completo}</h2>
        <button onClick={onEditar}
          className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition">
          <Pencil size={12}/> Editar cliente
        </button>
      </div>

      {/* Email + teléfono */}
      <p className="text-xs text-gray-400 mb-3">
        {cliente.email}
        {cliente.telefono && <> · <span>{cliente.telefono}</span></>}
      </p>

      {/* Badges */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
          cliente.estatus === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {cliente.estatus}
        </span>
        {sucNombre && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold text-white"
            style={{ backgroundColor: sucColor }}>
            {sucNombre}
          </span>
        )}
        {cliente.plan && (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700">
            {cliente.plan}
          </span>
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-4 divide-x divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">
        {[
          { label: 'Valor',     val: cliente.valor_cliente ? `$${(Number(cliente.valor_cliente)/1000).toFixed(0)}K` : '—' },
          { label: 'Visitas',   val: cliente.visitas ?? (cliente.reservas?.filter((r: any) => r.estatus === 'Confirmada').length || 0) },
          { label: 'No shows',  val: noShows },
          { label: 'NPS',       val: cliente.nps ? (
            <span className="flex items-center gap-1">{cliente.nps} <Star size={12} className="text-yellow-400 fill-yellow-400"/></span>
          ) : '—' },
        ].map(m => (
          <div key={m.label} className="px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">{m.label}</p>
            <p className="text-base font-black text-gray-900">{m.val}</p>
          </div>
        ))}
      </div>
    </div>
  )
}