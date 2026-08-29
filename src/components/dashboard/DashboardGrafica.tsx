'use client'
import { useEffect, useState } from 'react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { supabase } from '@/lib/supabase'

interface Props { margen: number; periodo: number }

export default function DashboardGrafica({ margen, periodo }: Props) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      const inicio = new Date()
      inicio.setDate(inicio.getDate() - periodo)
      inicio.setHours(0, 0, 0, 0)

      const { data: pagos } = await supabase
        .from('pagos')
        .select('monto, fecha_pago')
        .eq('estatus', 'Completado')
        .gte('fecha_pago', inicio.toISOString())

      // Si periodo <= 30, agrupar por día, si no por semana
      if (periodo <= 30) {
        const porDia: Record<string, number> = {}
        for (let i = periodo; i >= 0; i--) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const key = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
          porDia[key] = 0
        }
        pagos?.forEach(p => {
          const key = new Date(p.fecha_pago).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
          if (porDia[key] !== undefined) porDia[key] += Number(p.monto)
        })
        setData(Object.entries(porDia).map(([dia, Ingresos]) => ({ dia, Ingresos, Nomina: 0 })))
      } else {
        // Agrupar por mes
        const porMes: Record<string, number> = {}
        const meses = Math.ceil(periodo / 30)
        for (let i = meses; i >= 0; i--) {
          const d = new Date()
          d.setMonth(d.getMonth() - i)
          const key = d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })
          porMes[key] = 0
        }
        pagos?.forEach(p => {
          const key = new Date(p.fecha_pago).toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })
          if (porMes[key] !== undefined) porMes[key] += Number(p.monto)
        })
        setData(Object.entries(porMes).map(([dia, Ingresos]) => ({ dia, Ingresos, Nomina: 0 })))
      }

      setLoading(false)
    }
    fetchData()
  }, [periodo])

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900 text-sm">Ingresos vs. Nómina</h3>
        <span className="text-xs text-gray-400">
          Margen actual: <strong className="text-gray-700">{margen}%</strong>
        </span>
      </div>
      <div style={{ width: '100%', height: 160 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-xs">Cargando...</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gIng" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gNom" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="dia" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={36} />
              <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
              <Area type="monotone" dataKey="Ingresos" stroke="#6366f1" strokeWidth={2} fill="url(#gIng)" dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }} />
              <Area type="monotone" dataKey="Nomina" stroke="#22c55e" strokeWidth={2} fill="url(#gNom)" dot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }} />
              <Legend iconType="plainline" iconSize={16} wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}