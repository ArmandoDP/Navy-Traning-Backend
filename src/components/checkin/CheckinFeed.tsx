'use client'
import CheckinFeedItem from './CheckinFeedItem'
import { RefreshCw }   from 'lucide-react'

interface Props {
  checkins: any[]
  loading:  boolean
}

export default function CheckinFeed({ checkins, loading }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-gray-900">Check-ins recientes</p>
          <p className="text-xs text-gray-400 mt-0.5">Actualizados en tiempo real</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          En vivo
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 gap-2 text-sm">
          <RefreshCw size={14} className="animate-spin" /> Cargando...
        </div>
      ) : checkins.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm italic">
          No hay check-ins registrados hoy
        </div>
      ) : (
        <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
          {checkins.map(c => (
            <CheckinFeedItem key={c.id} checkin={c} />
          ))}
        </div>
      )}
    </div>
  )
}