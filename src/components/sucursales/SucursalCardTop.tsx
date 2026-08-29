'use client'
import { TrendingUp, TrendingDown, MapPin } from 'lucide-react'

interface Props {
  nombre:      string
  ciudad:      string
  ingresos:    number
  crecimiento: number
  color?:       string
}

export default function SucursalCardTop({ nombre, ciudad, ingresos, crecimiento, color }: Props) {
  const pos = crecimiento >= 0
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <MapPin size={13} style={{ color }} />
          <span className="text-sm font-medium text-gray-700">{nombre}, {ciudad}</span>
        </div>
        <span className={`flex items-center gap-0.5 text-xs font-bold ${pos ? 'text-green-500' : 'text-red-500'}`}>
          {pos ? <TrendingUp size={11}/> : <TrendingDown size={11}/>}
          {pos ? '+' : ''}{crecimiento}%
        </span>
      </div>
      <p className="text-2xl font-black text-gray-900">${ingresos.toLocaleString()}</p>
      <p className="text-gray-400 text-xs mt-0.5">Ingresos totales</p>
    </div>
  )
}