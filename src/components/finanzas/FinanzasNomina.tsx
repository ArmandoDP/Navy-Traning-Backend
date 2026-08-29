'use client'
import { useEffect, useState } from 'react'
import { supabase }            from '@/lib/supabase'
import { ChevronRight, X }     from 'lucide-react'

interface Props { fechaInicio: string; fechaFin: string, sucursalId: string | null }

const NIVEL_TARIFA: Record<string, number> = {
  Marine: 300, Seal: 420, Elite: 600, Junior: 200, 'Semi-senior': 350, Senior: 500, Lead: 400,
}

const NIVEL_COLORS: Record<string, string> = {
  Marine: '#06b6d4', Seal: '#3b82f6', Elite: '#f59e0b',
  Junior: '#9ca3af', 'Semi-senior': '#3b82f6', Senior: '#22c55e', Lead: '#9ca3af',
}

const TIPO_COLORS: Record<string, string> = {
  Coach: '#6366f1', Front: '#22c55e', Manager: '#f59e0b',
  Limpieza: '#9ca3af', Regional: '#ec4899', Mantto: '#f97316',
}

export default function FinanzasNomina({ fechaInicio, fechaFin, sucursalId }: Props) {
  const [loading,     setLoading]     = useState(true)
  const [staff,       setStaff]       = useState<any[]>([])
  const [nomina,      setNomina]      = useState<any[]>([])
  const [empleadoAct, setEmpleadoAct] = useState<any | null>(null)
  const [filtros,     setFiltros]     = useState({ sucursal: '', tipo: '', nivel: '' })
  const [sucursales,  setSucursales]  = useState<any[]>([])

  useEffect(() => {
    const fetch = async () => {
    setLoading(true)

    const [{ data: s }, { data: n }, { data: sucs }] = await Promise.all([
      supabase.from('staff')
        .select('*, staff_sucursales(sucursales(id, nombre, color))')
        .eq('estatus', 'Activo')
        .order('nombre'),  // ← sin filtro de sucursal aquí
      supabase.from('nomina_empleados')
        .select('*')
        .gte('created_at', fechaInicio)
        .lte('created_at', fechaFin + 'T23:59:59'),
      supabase.from('sucursales').select('id, nombre, color').eq('estatus', 'Activa'),
    ])

    if (s) {
      const staffFiltrado = sucursalId
        ? s.filter(st =>
            st.staff_sucursales?.some((ss: any) => ss.sucursales?.id === sucursalId)
          )
        : s
      setStaff(staffFiltrado)
    }
    if (sucs) setSucursales(sucs)
    if (!n || n.length === 0) setNomina([])
    else setNomina(n)

    setLoading(false)
  }
    fetch()
  }, [fechaInicio, fechaFin, sucursalId])

  // Cálculo automático por staff
  const staffConNomina = staff.map(emp => {
    const nominaEmp = nomina.find(n => n.staff_id === emp.id)
    const tarifa    = NIVEL_TARIFA[emp.nivel] || emp.tarifa_hora || 0
    const horas     = nominaEmp?.horas             || 0
    const clases    = nominaEmp?.clases_impartidas || 0
    const bono      = nominaEmp?.bono              || 0
    const ajuste    = nominaEmp?.ajuste            || 0
    const pagoBase  = emp.tipo === 'Coach'
      ? clases * tarifa
      : emp.sueldo_fijo || (horas * (emp.tarifa_hora || 0))
    const total = pagoBase + bono + ajuste

    return { ...emp, horas, clases, bono, ajuste, pagoBase, total, nominaEmp }
  })

  const filtrados = staffConNomina.filter(e =>
    (!filtros.tipo   || e.tipo === filtros.tipo) &&
    (!filtros.nivel  || e.nivel === filtros.nivel) &&
    (!filtros.sucursal || e.staff_sucursales?.some((ss: any) => ss.sucursales?.id === filtros.sucursal))
  )

  const totalCoaches   = filtrados.filter(e => e.tipo === 'Coach').length
  const pagoBaseTotal  = filtrados.reduce((a, e) => a + e.pagoBase, 0)
  const bonosTotal     = filtrados.reduce((a, e) => a + e.bono, 0)
  const totalAPagar    = filtrados.reduce((a, e) => a + e.total, 0)

  const selectCls = "border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none bg-white focus:border-gray-400 appearance-none cursor-pointer"

  if (loading) return <div className="p-10 text-center text-gray-400 italic text-sm">Cargando...</div>

  return (
    <div className="relative space-y-5">

      {/* Drawer detalle empleado */}
      {empleadoAct && (
        <>
          <div onClick={() => setEmpleadoAct(null)} className="fixed inset-0 z-40 bg-black/20" />
          <div className="fixed top-0 right-0 z-50 h-full w-96 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <p className="text-sm font-black text-gray-900">{empleadoAct.nombre} {empleadoAct.primer_apellido}</p>
                <p className="text-xs text-gray-400">{empleadoAct.tipo} · {empleadoAct.nivel || 'Sin nivel'}</p>
              </div>
              <button onClick={() => setEmpleadoAct(null)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                <X size={16}/>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {[
                { label: 'Pago base',     val: `$${empleadoAct.pagoBase.toLocaleString()}` },
                { label: 'Bono',          val: empleadoAct.bono > 0 ? `+$${empleadoAct.bono.toLocaleString()}` : '—' },
                { label: 'Ajuste',        val: empleadoAct.ajuste !== 0 ? `${empleadoAct.ajuste > 0 ? '+' : ''}$${empleadoAct.ajuste.toLocaleString()}` : '—' },
                { label: 'Clases',        val: empleadoAct.clases || '—' },
                { label: 'Horas',         val: empleadoAct.horas ? `${empleadoAct.horas}h` : '—' },
                { label: 'Total período', val: `$${empleadoAct.total.toLocaleString()}`, bold: true },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between border-b border-gray-50 pb-3">
                  <span className="text-sm text-gray-500">{r.label}</span>
                  <span className={`text-sm ${r.bold ? 'font-black text-gray-900' : 'font-medium text-gray-700'}`}>{r.val}</span>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <button className="w-full py-3 rounded-xl text-sm font-bold text-white transition"
                style={{ backgroundColor: '#171B24' }}>
                Aprobar nómina
              </button>
            </div>
          </div>
        </>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Coaches activos',    val: totalCoaches,                          sub: `${filtrados.reduce((a, e) => a + e.clases, 0)} clases impartidas`, color: 'text-gray-900' },
          { label: 'Pago base clases',   val: `$${(pagoBaseTotal/1000).toFixed(1)}k`, sub: 'Tarifa por nivel y clases', color: 'text-gray-900' },
          { label: 'Bonos y ajustes',    val: `$${(bonosTotal/1000).toFixed(1)}k`,    sub: 'Asistencia + manual', color: 'text-emerald-600' },
          { label: 'Total a pagar',      val: `$${(totalAPagar).toLocaleString()}`,   sub: `${new Date(fechaFin).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}`, color: 'text-gray-900' },
        ].map(m => (
          <div key={m.label} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-gray-400 font-medium">{m.label}</p>
            <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.val}</p>
            <p className="text-xs text-gray-400 mt-1">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Info banner */}
      <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 shadow-sm">
        <p className="text-sm font-black text-gray-900">Nómina calculada automáticamente:</p>
        <p className="text-xs text-gray-500 mt-1">
          Tarifa por nivel × clases impartidas + bono de asistencia + ajustes manuales. Click en cualquier coach para revisar y editar.
        </p>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-black text-gray-900">
            {filtrados.length} Miembros del Staff
            <span className="text-gray-400 font-normal text-xs ml-2">(0 seleccionados)</span>
          </p>
          <div className="flex items-center gap-2">
            <select className={selectCls} value={filtros.sucursal}
              onChange={e => setFiltros(p => ({ ...p, sucursal: e.target.value }))}>
              <option value="">Sucursal</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <select className={selectCls} value={filtros.tipo}
              onChange={e => setFiltros(p => ({ ...p, tipo: e.target.value }))}>
              <option value="">Tipo de empleado</option>
              {['Coach','Front','Manager','Limpieza','Regional','Mantto'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className={selectCls} value={filtros.nivel}
              onChange={e => setFiltros(p => ({ ...p, nivel: e.target.value }))}>
              <option value="">Nivel</option>
              {['Marine','Seal','Elite','Junior','Semi-senior','Senior','Lead'].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {(filtros.sucursal || filtros.tipo || filtros.nivel) && (
              <button onClick={() => setFiltros({ sucursal: '', tipo: '', nivel: '' })}
                className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1">
                <X size={12}/> Limpiar
              </button>
            )}
          </div>
        </div>

        <table className="w-full text-left">
          <thead className="text-xs font-bold text-gray-400 uppercase border-b border-gray-100">
            <tr>
              <th className="px-5 py-3">Empleado</th>
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Sucursales</th>
              <th className="px-5 py-3">Nivel</th>
              <th className="px-5 py-3">Clases</th>
              <th className="px-5 py-3">Bono</th>
              <th className="px-5 py-3">Ajuste</th>
              <th className="px-5 py-3">Horas</th>
              <th className="px-5 py-3">Nómina</th>
              <th className="px-5 py-3 w-8"/>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtrados.map(emp => (
              <tr key={emp.id} onClick={() => setEmpleadoAct(emp)}
                className="hover:bg-gray-50 transition cursor-pointer">
                <td className="px-5 py-3.5">
                  <p className="text-sm font-medium text-gray-900">{emp.nombre} {emp.primer_apellido}</p>
                </td>
                <td className="px-5 py-3.5">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg"
                    style={{ backgroundColor: `${TIPO_COLORS[emp.tipo] || '#9ca3af'}20`, color: TIPO_COLORS[emp.tipo] || '#9ca3af' }}>
                    {emp.tipo}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {emp.staff_sucursales?.slice(0, 2).map((ss: any, i: number) => (
                      <span key={i} className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: `${ss.sucursales?.color || '#6b7280'}20`, color: ss.sucursales?.color || '#6b7280' }}>
                        {ss.sucursales?.nombre}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  {emp.nivel ? (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: NIVEL_COLORS[emp.nivel] || '#9ca3af' }} />
                      <span className="text-xs font-semibold text-gray-700">{emp.nivel}</span>
                    </div>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-700">{emp.clases || '—'}</td>
                <td className="px-5 py-3.5 text-sm font-medium text-emerald-600">
                  {emp.bono > 0 ? `+$${emp.bono.toLocaleString()}` : '—'}
                </td>
                <td className="px-5 py-3.5 text-sm font-medium">
                  <span className={emp.ajuste < 0 ? 'text-red-500' : emp.ajuste > 0 ? 'text-emerald-600' : 'text-gray-300'}>
                    {emp.ajuste !== 0 ? `${emp.ajuste > 0 ? '+' : ''}$${emp.ajuste.toLocaleString()}` : '—'}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  {emp.horas > 0 ? (
                    <div>
                      <p className="text-sm font-medium text-gray-700">{emp.horas}h</p>
                      <p className="text-[11px] text-emerald-500 font-bold">✓ Al día</p>
                    </div>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-5 py-3.5">
                  <p className="text-sm font-black text-gray-900">${emp.total.toLocaleString()}</p>
                  <p className="text-[11px] text-gray-400">
                    ${NIVEL_TARIFA[emp.nivel] || emp.tarifa_hora || 0}/clase
                  </p>
                </td>
                <td className="px-5 py-3.5">
                  <ChevronRight size={16} className="text-gray-300" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}