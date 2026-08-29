'use client'
import { useEffect, useState } from 'react'
import { MapPin, ChevronRight, RefreshCw, Users, DollarSign, Activity, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Props { periodo: number; sucursalId: string | null }

const COLORS = ['#22c55e', '#6366f1', '#3b82f6', '#f97316', '#a855f7', '#eab308']

export default function DashboardSucursales({ periodo, sucursalId }: Props) {
  const [sucursales, setSucursales] = useState<any[]>([])
  const [detalle,    setDetalle]    = useState<any>(null)
  const [loading,    setLoading]    = useState(true)
  const router = useRouter()

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      const inicio = new Date()
      inicio.setDate(inicio.getDate() - periodo)
      inicio.setHours(0, 0, 0, 0)

      const [{ data: sedes }, { data: clientes }, { data: pagos }, { data: reservas }, { data: clases }, { data: membresias }] = await Promise.all([
        supabase.from('sucursales').select('id, nombre, color'),
        supabase.from('clientes').select('id, sucursal_id, estatus, created_at'),
        supabase.from('pagos').select('monto, sucursal_id, fecha_pago')
          .eq('estatus', 'Completado')
          .gte('fecha_pago', inicio.toISOString()),
        supabase.from('reservas').select('id, clase_id, estatus'),
        supabase.from('clases').select('id, sucursal_id, capacidad_max'),
        supabase.from('membresias').select('id, cliente_id, estatus, fecha_fin, clientes(sucursal_id)')
          .eq('estatus', 'Activa'),
      ])

      const claseSucursal: Record<string, string> = {}
      clases?.forEach(c => { claseSucursal[c.id] = c.sucursal_id })

      const rows = (sedes || []).map((s, i) => {
        const cli          = clientes?.filter(c => c.sucursal_id === s.id) || []
        const ingresos     = pagos?.filter(p => p.sucursal_id === s.id).reduce((a, p) => a + Number(p.monto), 0) || 0
        const clasesSede   = clases?.filter(c => c.sucursal_id === s.id) || []
        const capacidad    = clasesSede.reduce((a, c) => a + c.capacidad_max, 0)
        const reservasSede = reservas?.filter(r => claseSucursal[r.clase_id] === s.id) || []
        const confirmadas  = reservasSede.filter(r => r.estatus === 'Confirmada').length
        const ocu          = capacidad > 0 ? Math.round((confirmadas / capacidad) * 100) : 0
        const activos      = cli.filter(c => c.estatus === 'Activo').length
        const ret          = cli.length > 0 ? Math.round((activos / cli.length) * 100) : 0
        const membActivas  = membresias?.filter((m: any) => m.clientes?.sucursal_id === s.id).length || 0
        const nuevos       = cli.filter(c => new Date(c.created_at) >= inicio).length
        const color        = s.color || COLORS[i % COLORS.length]
        return { id: s.id, nombre: s.nombre, color, ingresos, ocu, ret, cli: cli.length, activos, membActivas, nuevos }
      })

      setSucursales(rows)

      // Si hay filtro de sucursal, mostrar detalle de esa sucursal
      if (sucursalId) {
        setDetalle(rows.find(r => r.id === sucursalId) || null)
      } else {
        setDetalle(null)
      }

      setLoading(false)
    }
    fetchData()
  }, [periodo, sucursalId])

  if (loading) return (
    <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm flex items-center justify-center h-64 text-gray-400 gap-2 text-sm">
      <RefreshCw size={14} className="animate-spin" /> Cargando sucursales...
    </div>
  )

  // ── Vista detalle de una sucursal ──────────────────────────────────────────
  if (detalle) return (
    <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: detalle.color }} />
          <h3 className="font-bold text-gray-900 text-sm">{detalle.nombre}</h3>
          <span className="text-xs text-gray-400">· Últimos {periodo} días</span>
        </div>
        <button
          onClick={() => router.push('/dashboard/finanzas')}
          className="text-indigo-500 text-xs font-bold hover:underline flex items-center gap-0.5">
          Ver finanzas <ChevronRight size={12}/>
        </button>
      </div>

      {/* Grid de métricas detalladas */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-gray-50">
        {[
          { icon: <DollarSign size={16} className="text-emerald-500"/>, label: 'Ingresos', val: `$${detalle.ingresos.toLocaleString()}`, sub: `Últimos ${periodo} días` },
          { icon: <Users size={16} className="text-blue-500"/>,        label: 'Clientes activos', val: detalle.activos, sub: `${detalle.cli} totales` },
          { icon: <Activity size={16} className="text-purple-500"/>,   label: 'Membresías activas', val: detalle.membActivas, sub: 'Con plan vigente' },
          { icon: <TrendingUp size={16} className="text-orange-500"/>, label: 'Nuevos clientes', val: detalle.nuevos, sub: `Últimos ${periodo} días` },
        ].map(m => (
          <div key={m.label} className="p-5">
            <div className="flex items-center gap-2 mb-2">
              {m.icon}
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">{m.label}</span>
            </div>
            <p className="text-2xl font-black text-gray-900">{m.val}</p>
            <p className="text-xs text-gray-400 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Barras de ocupación y retención */}
      <div className="px-5 py-4 border-t border-gray-50 grid grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500">Ocupación de clases</span>
            <span className="text-xs font-black text-blue-500">{detalle.ocu}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${detalle.ocu}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500">Retención de clientes</span>
            <span className="text-xs font-black text-emerald-500">{detalle.ret}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${detalle.ret}%` }} />
          </div>
        </div>
      </div>
    </div>
  )

  // ── Vista global — tabla de todas las sucursales ───────────────────────────
  return (
    <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-900 text-sm">Rendimiento por sucursal</h3>
        <button
          onClick={() => router.push('/dashboard/finanzas')}
          className="text-indigo-500 text-xs font-bold hover:underline flex items-center gap-0.5">
          Ver detalles <ChevronRight size={12}/>
        </button>
      </div>
      {sucursales.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-10">Aún no hay sucursales registradas</p>
      ) : (
        <table className="w-full text-left">
          <thead className="text-gray-400 text-[10px] font-bold uppercase">
            <tr>
              <th className="px-5 py-2.5">Sucursal</th>
              <th className="px-5 py-2.5">Ingresos</th>
              <th className="px-5 py-2.5">Ocupación</th>
              <th className="px-5 py-2.5">Retención</th>
              <th className="px-5 py-2.5">Clientes</th>
              <th className="px-5 py-2.5">Nuevos</th>
              <th className="px-5 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sucursales.map(s => (
              <tr key={s.nombre} className="hover:bg-gray-50 transition cursor-pointer">
                <td className="px-5 py-3 text-sm font-medium text-gray-900">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.nombre}
                  </div>
                </td>
                <td className="px-5 py-3 text-sm font-bold text-gray-900">${s.ingresos.toLocaleString()}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${s.ocu}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">{s.ocu}%</span>
                  </div>
                </td>
                <td className="px-5 py-3"><span className="text-sm font-bold text-emerald-500">{s.ret}%</span></td>
                <td className="px-5 py-3 text-sm text-gray-700">{s.activos}<span className="text-gray-400 font-normal">/{s.cli}</span></td>
                <td className="px-5 py-3">
                  <span className="text-xs font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">
                    +{s.nuevos}
                  </span>
                </td>
                <td className="px-5 py-3"><ChevronRight size={14} className="text-gray-400" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}