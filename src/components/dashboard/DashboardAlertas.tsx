'use client'
import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, BarChart2, ChevronRight, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Props { sucursalId?: string | null }

export default function DashboardAlertas( { sucursalId }: Props ) {
  const [alertas, setAlertas] = useState({ pagosFallidos: 0, membresiasPorExpirar: 0, clasesBajaOcupacion: 0 })
  const [loading, setLoading] = useState(true)

  const router = useRouter()

  useEffect(() => {
    const fetchAlertas = async () => {
      const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const en7dias   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

      let qFallidos = supabase.from('pagos').select('id')
        .eq('estatus', 'Fallido').gte('fecha_pago', hace7dias)
      if (sucursalId) qFallidos = qFallidos.eq('sucursal_id', sucursalId)

      const [{ data: pagosFallidos }, { data: membresias }, { data: clases }, { data: reservas }] = await Promise.all([
        qFallidos,
        supabase.from('membresias')
          .select('id, clientes(sucursal_id)')
          .eq('estatus', 'Activa')
          .lte('fecha_fin', en7dias)
          .gte('fecha_fin', new Date().toISOString()),
        supabase.from('clases').select('id, capacidad_max'),
        supabase.from('reservas').select('id, clase_id'),
      ])

      // Filtrar membresías por sucursal en JS
      const membresiasFiltradas = sucursalId
        ? membresias?.filter((m: any) => m.clientes?.sucursal_id === sucursalId)
        : membresias

      // Ocupación por clase
      const reservasPorClase: Record<string, number> = {}
      reservas?.forEach(r => {
        reservasPorClase[r.clase_id] = (reservasPorClase[r.clase_id] || 0) + 1
      })
      const clasesBajaOcupacion = clases?.filter(c => {
        const ocupadas = reservasPorClase[c.id] || 0
        return c.capacidad_max > 0 && (ocupadas / c.capacidad_max) < 0.5
      }).length || 0

      setAlertas({
        pagosFallidos:       pagosFallidos?.length || 0,
        membresiasPorExpirar: membresiasFiltradas?.length || 0,
        clasesBajaOcupacion,
      })
      setLoading(false)
    }
    fetchAlertas()
  }, [sucursalId])

  const items = [
    { icon: <AlertTriangle size={14} className="text-red-500" />, bg: 'bg-red-50 border-red-100', iconBg: 'bg-red-100', label: 'Pagos fallidos', sub: 'Últ. 7 días', val: alertas.pagosFallidos, color: 'text-red-500', arrow: 'text-red-400' },
    { icon: <Clock size={14} className="text-yellow-500" />, bg: 'bg-yellow-50 border-yellow-100', iconBg: 'bg-yellow-100', label: 'Membresías por expirar', sub: 'Próximos 7 días', val: alertas.membresiasPorExpirar, color: 'text-yellow-500', arrow: 'text-yellow-400' },
    { icon: <BarChart2 size={14} className="text-blue-500" />, bg: 'bg-blue-50 border-blue-100', iconBg: 'bg-blue-100', label: 'Clases con baja ocupación', sub: 'Menos del 50%', val: alertas.clasesBajaOcupacion, color: 'text-blue-500', arrow: 'text-blue-400' },
  ]
  const total = alertas.pagosFallidos + alertas.membresiasPorExpirar + alertas.clasesBajaOcupacion

  if (loading) return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex items-center justify-center h-40 text-gray-400 gap-2 text-sm">
      <RefreshCw size={14} className="animate-spin" /> Cargando alertas...
    </div>
  )

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-gray-900 text-sm">Alertas críticas</h3>
          {total > 0 && <span className="bg-red-500 text-white text-xs font-black px-1.5 py-0.5 rounded-full">{total}</span>}
        </div>
        <button 
          onClick={() => router.push('/dashboard/alertas')}
          className="text-indigo-500 text-xs font-bold hover:underline flex items-center gap-0.5">
          Ver alertas <ChevronRight size={12}/>
        </button>
      </div>
      <div className="space-y-2">
        {total === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Sin alertas por el momento</p>
        ) : items.filter(a => a.val > 0).map(a => (
          <div key={a.label} className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer transition hover:opacity-80 ${a.bg}`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 ${a.iconBg} rounded-lg flex items-center justify-center`}>{a.icon}</div>
              <div>
                <p className="text-xs font-bold text-gray-800">{a.label}</p>
                <p className="text-[10px] text-gray-400">{a.sub}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className={`text-xl font-black ${a.color}`}>{a.val}</span>
              <ChevronRight size={14} className={a.arrow}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}