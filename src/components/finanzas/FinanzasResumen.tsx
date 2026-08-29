'use client'
import { useEffect, useState } from 'react'
import { supabase }            from '@/lib/supabase'
import { TrendingUp, TrendingDown, AlertTriangle, Receipt } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Props { fechaInicio: string; fechaFin: string, sucursalId:  string | null }

const COLORS_INGRESOS = ['#171B24','#6366f1','#9ca3af','#22c55e']
const COLORS_COSTOS   = ['#171B24','#6366f1','#9ca3af','#f59e0b']

export default function FinanzasResumen({ fechaInicio, fechaFin, sucursalId }: Props) {
  const [loading,     setLoading]     = useState(true)
  const [ingresos,    setIngresos]    = useState(0)
  const [fallidos,    setFallidos]    = useState(0)
  const [txExitosas,  setTxExitosas]  = useState(0)
  const [ticketProm,  setTicketProm]  = useState(0)
  const [donutData,   setDonutData]   = useState<any[]>([])
  const [ultTx, setUltTx] = useState<any[]>([])
  const [ingresosAnt, setIngresosAnt] = useState(0)

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)

      // Query de pagos con filtro de sucursal
      let qPagos = supabase
        .from('pagos')
        .select('monto, estatus, canal, concepto, metodo_pago')
        .gte('fecha_pago', fechaInicio)
        .lte('fecha_pago', fechaFin + 'T23:59:59')
        .eq('estatus', 'Completado')
      if (sucursalId) qPagos = qPagos.eq('sucursal_id', sucursalId)

      const { data: pagos } = await qPagos

      if (pagos) {
        const exitosos = pagos.filter(p => p.estatus === 'Completado' || p.estatus === 'Exitoso')
        const fall     = pagos.filter(p => p.estatus === 'Fallido')
        const total    = exitosos.reduce((a, p) => a + (p.monto || 0), 0)

        setIngresos(total)
        setFallidos(fall.length)
        setTxExitosas(exitosos.length)
        setTicketProm(exitosos.length > 0 ? Math.round(total / exitosos.length) : 0)

        // Mes anterior
        const fechaInicioAnt = new Date(fechaInicio)
        fechaInicioAnt.setMonth(fechaInicioAnt.getMonth() - 1)
        const fechaFinAnt = new Date(fechaFin)
        fechaFinAnt.setMonth(fechaFinAnt.getMonth() - 1)

        let qPagosAnt = supabase
          .from('pagos')
          .select('monto, estatus')
          .gte('fecha_pago', fechaInicioAnt.toISOString().split('T')[0])
          .lte('fecha_pago', fechaFinAnt.toISOString().split('T')[0] + 'T23:59:59')
        if (sucursalId) qPagosAnt = qPagosAnt.eq('sucursal_id', sucursalId)

        const { data: pagosAnt } = await qPagosAnt
        if (pagosAnt) {
          const exitososAnt = pagosAnt.filter(p => p.estatus === 'Completado' || p.estatus === 'Exitoso')
          setIngresosAnt(exitososAnt.reduce((a, p) => a + (p.monto || 0), 0))
        }

        // Donut por canal
        const canales: Record<string, number> = {}
        exitosos.forEach(p => {
          const c = p.canal || 'Navy'
          canales[c] = (canales[c] || 0) + (p.monto || 0)
        })
        setDonutData(Object.entries(canales).map(([name, value]) => ({ name, value })))
      }

      // Últimas transacciones con filtro de sucursal
      let qTx = supabase
        .from('pagos')
        .select('id, monto, estatus, fecha_pago, concepto, sucursal_id, cliente_id, clientes(nombre_completo), sucursales(nombre, color)')
        .gte('fecha_pago', fechaInicio)
        .lte('fecha_pago', fechaFin + 'T23:59:59')
        .eq('estatus', 'Completado')
        .not('cliente_id', 'is', null)
        .order('fecha_pago', { ascending: false })
        .limit(10)
      if (sucursalId) qTx = qTx.eq('sucursal_id', sucursalId)

      const { data: txData } = await qTx
      if (txData) setUltTx(txData)

      setLoading(false)
    }
    fetch()
  }, [fechaInicio, fechaFin, sucursalId]) // ← agrega sucursalId

  const costos    = Math.round(ingresos * 0.56)  // 56% de los ingresos
  const margen    = ingresos > 0 ? Math.round(((ingresos - costos) / ingresos) * 100) : 0
  const utilidad  = ingresos - costos

  const pctCambio = (actual: number, anterior: number) => {
    if (anterior === 0) return '+0%'
    const diff = ((actual - anterior) / anterior) * 100
    return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`
  }

  const costosAnt    = Math.round(ingresosAnt * 0.56)
  const utilidadAnt  = ingresosAnt - costosAnt
  const margenAnt    = ingresosAnt > 0 ? Math.round(((ingresosAnt - costosAnt) / ingresosAnt) * 100) : 0

  const METRICAS = [
    { label: 'Ingresos del mes',  val: `$${(ingresos/1000).toFixed(1)}k`,  badge: pctCambio(ingresos, ingresosAnt),  color: ingresos >= ingresosAnt ? 'text-emerald-600' : 'text-red-500', icon: TrendingUp },
    { label: 'Costos',            val: `$${(costos/1000).toFixed(1)}k`,    badge: pctCambio(costos, costosAnt),      color: costos <= costosAnt ? 'text-emerald-600' : 'text-red-500',   icon: TrendingDown },
    { label: 'Margen operativo',  val: `${margen}%`,                        badge: `${margen - margenAnt >= 0 ? '+' : ''}${(margen - margenAnt).toFixed(1)}pp`, color: margen >= margenAnt ? 'text-emerald-600' : 'text-red-500', icon: TrendingUp },
    { label: 'Utilidad',          val: `$${(utilidad/1000).toFixed(1)}k`,  badge: pctCambio(utilidad, utilidadAnt), color: utilidad >= utilidadAnt ? 'text-emerald-600' : 'text-red-500', icon: TrendingUp },
  ]

  if (loading) return <div className="p-10 text-center text-gray-400 italic text-sm">Cargando...</div>

  return (
    <div className="space-y-5">

      {/* Métricas principales */}
      <div className="grid grid-cols-4 gap-4">
        {METRICAS.map(m => (
          <div key={m.label} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-gray-400 font-medium">{m.label}</p>
            <div className="flex items-end justify-between mt-2">
              <p className="text-2xl font-black text-gray-900">{m.val}</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                m.color === 'text-emerald-600' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
              }`}>
                {m.badge}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Cards secundarias */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-gray-500 font-medium">Transacciones exitosas</p>
          <p className="text-3xl font-black text-emerald-600 mt-1">{txExitosas}</p>
          <p className="text-xs text-gray-400 mt-1">${ingresos.toLocaleString()} en muestra · 24h</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-gray-500 font-medium">Pagos fallidos</p>
          <p className="text-3xl font-black text-red-500 mt-1">{fallidos}</p>
          <p className="text-xs text-gray-400 mt-1">5.0% del total · riesgo estimado</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-gray-500 font-medium">Ticket promedio</p>
          <p className="text-3xl font-black text-gray-900 mt-1">${ticketProm.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">por transacción exitosa</p>
        </div>
      </div>

      {/* Gráficas donut */}
      <div className="grid grid-cols-2 gap-4">
        {/* Desglose ingresos */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-black text-gray-900">Desglose de ingresos</p>
          <p className="text-xs text-gray-400 mb-4">Distribución del ingreso bruto</p>
          {donutData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                  dataKey="value" paddingAngle={2}>
                  {donutData.map((_, i) => (
                    <Cell key={i} fill={COLORS_INGRESOS[i % COLORS_INGRESOS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-300 italic text-sm">
              Sin datos para este período
            </div>
          )}
        </div>

        {/* Costos */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-black text-gray-900">Costos</p>
          <p className="text-xs text-gray-400 mb-4">Distribución del ingreso bruto</p>
          {donutData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Nómina coaches', value: Math.round(costos * 0.70) },
                    { name: 'Nómina staff + ops', value: Math.round(costos * 0.12) },
                    { name: 'Arriendo + servicios', value: Math.round(costos * 0.12) },
                    { name: 'Otros', value: Math.round(costos * 0.06) },
                  ]}
                  cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                  dataKey="value" paddingAngle={2}>
                  {COLORS_COSTOS.map((color, i) => <Cell key={i} fill={color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-300 italic text-sm">
              Sin datos para este período
            </div>
          )}
        </div>
      </div>
      {/* Últimas transacciones */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-black text-gray-900">
              Últimas transacciones <span className="text-gray-400 font-normal text-xs">(En vivo · Stripe)</span>
            </p>
          </div>
          <table className="w-full text-left">
            <thead className="text-xs font-bold text-gray-400 uppercase border-b border-gray-100">
              <tr>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Hora</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Concepto</th>
                <th className="px-5 py-3">Sucursal</th>
                <th className="px-5 py-3">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ultTx.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400 italic text-sm">
                  No hay transacciones para este período
                </td></tr>
              ) : ultTx.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-3.5 text-sm text-gray-600">
                    {new Date(p.fecha_pago).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">
                    {new Date(p.fecha_pago).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-5 py-3.5 text-sm font-medium text-gray-900">
                    {p.clientes?.nombre_completo || '—'}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{p.concepto || '—'}</td>
                  <td className="px-5 py-3.5">
                    {p.sucursales ? (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg"
                        style={{ backgroundColor: `${p.sucursales.color}20`, color: p.sucursales.color }}>
                        {p.sucursales.nombre}
                      </span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-sm font-black text-gray-900">${p.monto?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </div>
  )
}