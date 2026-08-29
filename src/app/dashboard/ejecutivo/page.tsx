'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, Zap } from 'lucide-react'
import DashboardMetricas       from '@/components/dashboard/DashboardMetricas'
import DashboardEstadoClientes from '@/components/dashboard/DashboardEstadoClientes'
import DashboardAlertas        from '@/components/dashboard/DashboardAlertas'
import DashboardGrafica        from '@/components/dashboard/DashboardGrafica'
import DashboardSucursales     from '@/components/dashboard/DashboardSucursales'
import DashboardActividad      from '@/components/dashboard/DashboardActividad'
import { useSucursal } from '@/context/SucursalContext'

const PERIODOS = [
  { label: 'Hoy',        dias: 1   },
  { label: '7 días',     dias: 7   },
  { label: '15 días',    dias: 15  },
  { label: '30 días',    dias: 30  },
  { label: '2 meses',    dias: 60  },
  { label: '3 meses',    dias: 90  },
  { label: 'Este año',   dias: 365 },
]

export default function DashboardEjecutivo() {
  const [periodo,      setPeriodo]      = useState(30)
  const [metrics,      setMetrics]      = useState({
    ingresos: 0, clientesActivos: 0, totalClientes: 0,
    ocupacion: 0, retencion: 0, nominaTotal: 0
  })
  const [metricsAnt,   setMetricsAnt]   = useState({ ingresos: 0, clientesActivos: 0 })
  const [loading, setLoading] = useState(true)
  const { sucursalId } = useSucursal()

  const fechaInicio = () => {
    const d = new Date()
    d.setDate(d.getDate() - periodo)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }

  const fechaInicioAnt = () => {
    const d = new Date()
    d.setDate(d.getDate() - periodo * 2)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }

  const fechaFinAnt = () => {
    const d = new Date()
    d.setDate(d.getDate() - periodo)
    d.setHours(23, 59, 59, 999)
    return d.toISOString()
  }

  const fetchData = async () => {
    setLoading(true)
    const inicio    = fechaInicio()    // ← primero las variables
    const inicioAnt = fechaInicioAnt()
    const finAnt    = fechaFinAnt()

    let qClientes = supabase.from('clientes').select('id, estatus')
    if (sucursalId) qClientes = qClientes.eq('sucursal_id', sucursalId)

    let qPagos = supabase.from('pagos').select('monto, fecha_pago')
      .eq('estatus', 'Completado').gte('fecha_pago', inicio)
    if (sucursalId) qPagos = qPagos.eq('sucursal_id', sucursalId)

    const [
      { data: clientes },
      { data: pagos },
      { data: clases },
      { data: reservas },
      { data: pagosAnt },
      { data: clientesAnt },
    ] = await Promise.all([
      qClientes,
      qPagos,
      supabase.from('clases').select('id, capacidad_max'),
      supabase.from('reservas').select('id'),
      supabase.from('pagos').select('monto')
        .eq('estatus', 'Completado')
        .gte('fecha_pago', inicioAnt)
        .lte('fecha_pago', finAnt),
      supabase.from('clientes').select('id, estatus')
        .lte('created_at', finAnt),
    ])

    const total     = clientes?.length || 0
    const activos   = clientes?.filter(c => c.estatus === 'Activo').length || 0
    const ingresos  = pagos?.reduce((a, p) => a + Number(p.monto), 0) || 0
    const capTotal  = clases?.reduce((a, c) => a + c.capacidad_max, 0) || 1
    const ocupacion = Math.round(((reservas?.length || 0) / capTotal) * 100)
    const retencion = total > 0 ? Math.round((activos / total) * 100) : 0

    const ingresosAnt   = pagosAnt?.reduce((a, p) => a + Number(p.monto), 0) || 0
    const activosAnt    = clientesAnt?.filter(c => c.estatus === 'Activo').length || 0

    setMetrics({ ingresos, clientesActivos: activos, totalClientes: total, ocupacion, retencion, nominaTotal: 0 })
    setMetricsAnt({ ingresos: ingresosAnt, clientesActivos: activosAnt })
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [periodo, sucursalId])

  const deltaIngresos = metricsAnt.ingresos > 0
    ? Math.round(((metrics.ingresos - metricsAnt.ingresos) / metricsAnt.ingresos) * 100)
    : 0
  const deltaClientes = metricsAnt.clientesActivos > 0
    ? Math.round(((metrics.clientesActivos - metricsAnt.clientesActivos) / metricsAnt.clientesActivos) * 100)
    : 0
  const margen = metrics.ingresos > 0
    ? Math.round(((metrics.ingresos - metrics.nominaTotal) / metrics.ingresos) * 100)
    : 0

  const labelPeriodo = PERIODOS.find(p => p.dias === periodo)?.label || '30 días'

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
      <RefreshCw size={16} className="animate-spin" /> Cargando métricas...
    </div>
  )

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Visión general del negocio · <span className="text-indigo-500 font-medium">{labelPeriodo}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {PERIODOS.map(p => (
            <button
              key={p.dias}
              onClick={() => setPeriodo(p.dias)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                periodo === p.dias
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Métricas */}
      <DashboardMetricas
        {...metrics}
        deltaIngresos={deltaIngresos}
        deltaClientes={deltaClientes}
      />

      {/* Fila media */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DashboardEstadoClientes totalClientes={metrics.totalClientes} clientesActivos={metrics.clientesActivos} />
        <DashboardAlertas sucursalId={sucursalId} />
        <DashboardGrafica margen={margen} periodo={periodo} />
      </div>

      {/* Fila inferior */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DashboardSucursales periodo={periodo} sucursalId={sucursalId}/>
        <DashboardActividad />
      </div>

    </div>
  )
}