'use client'
import { useEffect, useState } from 'react'
import { ChevronRight, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const ICONOS: Record<string, string> = {
  nuevo_cliente: '👤', nueva_reserva: '📅', pago_fallido: '❌', nueva_clase: '✅',
}
function tiempoRelativo(fecha: string) {
  const diff = Math.round((Date.now() - new Date(fecha).getTime()) / 60000)
  if (diff < 60) return `${diff} min`
  if (diff < 1440) return `${Math.round(diff / 60)} hr`
  return `${Math.round(diff / 1440)} d`
}

export default function DashboardActividad() {
  const [actividad, setActividad] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchActividad = async () => {
      const { data } = await supabase
        .from('actividad_log')
        .select('id, tipo, descripcion, created_at, sucursales(nombre)')
        .order('created_at', { ascending: false })
        .limit(5)
      setActividad(data || [])
      setLoading(false)
    }
    fetchActividad()
  }, [])

  if (loading) return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex items-center justify-center h-40 text-gray-400 gap-2 text-sm">
      <RefreshCw size={14} className="animate-spin" /> Cargando actividad...
    </div>
  )

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900 text-sm">Actividad reciente</h3>
        <button className="text-indigo-500 text-xs font-bold hover:underline flex items-center gap-0.5">
          Ver todo <ChevronRight size={12}/>
        </button>
      </div>
      <div className="space-y-3">
        {actividad.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Sin actividad reciente</p>
        ) : actividad.map(a => (
          <div key={a.id} className="flex items-start gap-3">
            <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-sm flex-shrink-0">
              {ICONOS[a.tipo] || '•'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-700 leading-tight">
                {a.descripcion}{' '}
                {a.sucursales?.nombre && (
                  <span className="font-bold px-1.5 py-0.5 rounded-md text-white text-[10px] bg-indigo-500">
                    {a.sucursales.nombre}
                  </span>
                )}
              </p>
            </div>
            <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">{tiempoRelativo(a.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}