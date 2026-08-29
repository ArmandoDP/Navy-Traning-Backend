'use client'
import { useEffect, useState } from 'react'
import { supabase }            from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'

interface Props { fechaInicio: string; fechaFin: string }

const CANALES = ['Navy','Stripe','Fitpass','Totalpass','Wellhub']
const CANAL_COLORS: Record<string, string> = {
  Navy: '#171B24', Stripe: '#6366f1', Fitpass: '#9ca3af', Totalpass: '#22c55e', Wellhub: '#f59e0b'
}

export default function FinanzasIngresos({ fechaInicio, fechaFin }: Props) {
  const [loading,     setLoading]     = useState(true)
  const [pagos,       setPagos]       = useState<any[]>([])
  const [sucursales,  setSucursales]  = useState<any[]>([])
  const [totalBrutoAnt, setTotalBrutoAnt] = useState(0)

  useEffect(() => {
  const fetch = async () => {
    setLoading(true)
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from('pagos').select('monto, canal, sucursal_id, estatus')
        .gte('fecha_pago', fechaInicio).lte('fecha_pago', fechaFin + 'T23:59:59')
        .eq('estatus', 'Completado'),
      supabase.from('sucursales').select('id, nombre, color').eq('estatus', 'Activa'),
    ])
    if (p) setPagos(p)
    if (s) setSucursales(s)

    // Mes anterior
    const fechaInicioAnt = new Date(fechaInicio)
    fechaInicioAnt.setMonth(fechaInicioAnt.getMonth() - 1)
    const fechaFinAnt = new Date(fechaFin)
    fechaFinAnt.setMonth(fechaFinAnt.getMonth() - 1)

    const { data: pagosAnt } = await supabase
      .from('pagos')
      .select('monto, estatus')
      .gte('fecha_pago', fechaInicioAnt.toISOString().split('T')[0])
      .lte('fecha_pago', fechaFinAnt.toISOString().split('T')[0] + 'T23:59:59')
      .eq('estatus', 'Completado')

    if (pagosAnt) {
      setTotalBrutoAnt(pagosAnt.reduce((a, p) => a + (p.monto || 0), 0))
    }

    setLoading(false)
  }
  fetch()
}, [fechaInicio, fechaFin])

  const totalBruto   = pagos.reduce((a, p) => a + (p.monto || 0), 0)
  const comisiones   = Math.round(totalBruto * 0.055)
  const neto         = totalBruto - comisiones
  const pctDirecto   = totalBruto > 0
    ? Math.round((pagos.filter(p => p.canal === 'Navy').reduce((a, p) => a + p.monto, 0) / totalBruto) * 100)
    : 0

  // Barras por sucursal
  const barData = sucursales.map(s => {
    const pagosSuc = pagos.filter(p => p.sucursal_id === s.id)
    const row: any = { sucursal: s.nombre, total: pagosSuc.reduce((a, p) => a + p.monto, 0) }
    CANALES.forEach(c => {
      row[c] = pagosSuc.filter(p => p.canal === c).reduce((a, p) => a + p.monto, 0)
    })
    return row
  }).sort((a, b) => b.total - a.total)

  // Donut mezcla canales
  const canalData = CANALES.map(c => ({
    name: c,
    value: pagos.filter(p => p.canal === c).reduce((a, p) => a + p.monto, 0)
  })).filter(c => c.value > 0)

  // Tabla detalle por sucursal
  const tablaData = sucursales.map(s => {
    const pagosSuc = pagos.filter(p => p.sucursal_id === s.id)
    const bruto    = pagosSuc.reduce((a, p) => a + p.monto, 0)
    const com      = Math.round(bruto * 0.055)
    const row: any = { nombre: s.nombre, color: s.color, bruto, comision: com, neto: bruto - com }
    CANALES.forEach(c => {
      row[c] = pagosSuc.filter(p => p.canal === c).reduce((a, p) => a + p.monto, 0)
    })
    return row
  })

  const totalRow = {
    nombre: 'TOTAL', color: '', bruto: totalBruto, comision: comisiones, neto,
    ...Object.fromEntries(CANALES.map(c => [c, pagos.filter(p => p.canal === c).reduce((a, p) => a + p.monto, 0)]))
  }

  if (loading) return <div className="p-10 text-center text-gray-400 italic text-sm">Cargando...</div>

  return (
    <div className="space-y-5">

      {/* Métricas */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Ingreso bruto',        val: `$${(totalBruto/1000).toFixed(1)}k`,  sub: `${totalBrutoAnt > 0 ? ((totalBruto - totalBrutoAnt) / totalBrutoAnt * 100).toFixed(1) : '0'}% vs mes anterior`, color: 'text-emerald-600' },
          { label: 'Comisiones plataformas', val: `$${(comisiones/1000).toFixed(1)}k`, sub: 'Stripe + Fitpass + Wellhub', color: 'text-emerald-600' },
          { label: 'Ingreso neto',          val: `$${(neto/1000).toFixed(1)}k`,        sub: `${totalBruto > 0 ? Math.round(neto/totalBruto*100) : 0}% del bruto`, color: 'text-emerald-600' },
          { label: '% Canal directo',       val: `${pctDirecto}%`,                     sub: 'Sin comisión', color: 'text-gray-900' },
        ].map(m => (
          <div key={m.label} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-gray-400 font-medium">{m.label}</p>
            <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.val}</p>
            <p className="text-xs text-gray-400 mt-1">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Barras + Donut */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-black text-gray-900">Ingresos por sucursal · stack por origen</p>
          <p className="text-xs text-gray-400 mb-4">Ordenado por ingreso bruto</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} layout="vertical" barSize={16}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="sucursal" width={70} tick={{ fontSize: 12, fill: '#6b7280' }} />
              <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
              {CANALES.map(c => (
                <Bar key={c} dataKey={c} stackId="a" fill={CANAL_COLORS[c]} radius={c === 'Wellhub' ? [0,4,4,0] : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          {/* Leyenda */}
          <div className="flex flex-wrap gap-3 mt-2">
            {CANALES.map(c => (
              <div key={c} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CANAL_COLORS[c] }} />
                <span className="text-xs text-gray-500">{c}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-black text-gray-900">Mezcla de canales · global</p>
          <p className="text-xs text-gray-400 mb-2">Distribución del ingreso bruto</p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="55%" height={200}>
              <PieChart>
                <Pie data={canalData} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                  dataKey="value" paddingAngle={2}>
                  {canalData.map((c, i) => <Cell key={i} fill={CANAL_COLORS[c.name]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 flex-1">
              {canalData.map(c => (
                <div key={c.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CANAL_COLORS[c.name] }} />
                    <span className="text-gray-700 font-medium">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-900 font-bold">{c.value.toLocaleString()}</span>
                    <span className="text-gray-400">{totalBruto > 0 ? Math.round(c.value/totalBruto*100) : 0}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabla detalle */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-black text-gray-900">Detalle por sucursal
            <span className="text-gray-400 font-normal text-xs ml-2">Bruto · comisión · neto, por canal</span>
          </p>
        </div>
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-xs font-bold text-gray-400 uppercase border-b border-gray-100">
            <tr>
              <th className="px-5 py-3">Sucursal</th>
              {CANALES.map(c => <th key={c} className="px-4 py-3">{c}</th>)}
              <th className="px-4 py-3">Bruto</th>
              <th className="px-4 py-3">Comisión</th>
              <th className="px-4 py-3">Neto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[...tablaData, totalRow].map((row, i) => {
              const isTotal = row.nombre === 'TOTAL'
              return (
                <tr key={i} className={isTotal ? 'bg-gray-50 font-bold' : 'hover:bg-gray-50'}>
                  <td className="px-5 py-3.5">
                    {isTotal ? (
                      <span className="text-sm font-black text-gray-900">TOTAL</span>
                    ) : (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg"
                        style={{ backgroundColor: `${row.color}20`, color: row.color }}>
                        {row.nombre}
                      </span>
                    )}
                  </td>
                  {CANALES.map(c => (
                    <td key={c} className="px-4 py-3.5 text-sm text-gray-700">
                      {row[c] > 0 ? `$${Math.round(row[c]/1000)}k` : '—'}
                    </td>
                  ))}
                  <td className="px-4 py-3.5 text-sm font-bold text-gray-900">${Math.round(row.bruto/1000)}k</td>
                  <td className="px-4 py-3.5 text-sm text-red-500">-${Math.round(row.comision/1000)}k</td>
                  <td className="px-4 py-3.5 text-sm font-bold text-gray-900">${Math.round(row.neto/1000)}k</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}