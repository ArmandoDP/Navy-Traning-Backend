'use client'
import { useEffect, useState } from 'react'
import { supabase }            from '@/lib/supabase'
import { RefreshCw, X }        from 'lucide-react'

interface Props { fechaInicio: string; fechaFin: string, sucursalId: string | null }

type SubTab = 'todo' | 'notificados' | 'resueltos'

export default function FinanzasPagosFallidos({ fechaInicio, fechaFin, sucursalId }: Props) {
  const [loading,    setLoading]    = useState(true)
  const [fallidos,   setFallidos]   = useState<any[]>([])
  const [sucursales, setSucursales] = useState<any[]>([])
  const [subTab,     setSubTab]     = useState<SubTab>('todo')
  const [selected,   setSelected]   = useState<string[]>([])
  const [filtros,    setFiltros]    = useState({ sucursal: '', motivo: '', estado: '' })

  const fetchFallidos = async () => {
    setLoading(true)
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from('pagos')
        .select('*, clientes(nombre_completo, email), sucursales(nombre, color)')
        .eq('estatus', 'Fallido')
        .gte('fecha_pago', fechaInicio)
        .lte('fecha_pago', fechaFin + 'T23:59:59')
        .order('fecha_pago', { ascending: false }),
      supabase.from('sucursales').select('id, nombre, color').eq('estatus', 'Activa'),
    ])
    if (p) setFallidos(p)
    if (s) setSucursales(s)
    setLoading(false)
  }

  useEffect(() => {
    const fetchFallidos = async () => {
      setLoading(true)

      let qFallidos = supabase.from('pagos')
        .select('*, clientes(nombre_completo, email), sucursales(nombre, color)')
        .eq('estatus', 'Fallido')
        .gte('fecha_pago', fechaInicio)
        .lte('fecha_pago', fechaFin + 'T23:59:59')
        .order('fecha_pago', { ascending: false })
      if (sucursalId) qFallidos = qFallidos.eq('sucursal_id', sucursalId)

      const [{ data: p }, { data: s }] = await Promise.all([
        qFallidos,
        supabase.from('sucursales').select('id, nombre, color').eq('estatus', 'Activa'),
      ])
      if (p) setFallidos(p)
      if (s) setSucursales(s)
      setLoading(false)
    }
    fetchFallidos()
  }, [fechaInicio, fechaFin, sucursalId])

  const filtrados = fallidos.filter(p =>
    (!filtros.sucursal || p.sucursal_id === filtros.sucursal) &&
    (!filtros.motivo   || p.motivo_fallo === filtros.motivo) &&
    (!filtros.estado   || (subTab === 'todo' ? true : subTab === 'notificados' ? p.intentos_cobro > 0 : p.intentos_cobro >= 3))
  )

  const totalFallidos   = fallidos.length
  const montoRiesgo     = fallidos.reduce((a, p) => a + (p.monto || 0), 0)
  const reintentosProm  = fallidos.length > 0
    ? (fallidos.reduce((a, p) => a + (p.intentos_cobro || 0), 0) / fallidos.length).toFixed(1)
    : '0'
  const elegiblesReintento = fallidos.filter(p => (p.intentos_cobro || 0) < 3).length

  const handleReintentar = async (id: string) => {
    await supabase.from('pagos').update({ intentos_cobro: supabase.rpc('increment', { x: 1 }) }).eq('id', id)
    fetchFallidos()
  }

  const selectCls = "border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none bg-white focus:border-gray-400 appearance-none cursor-pointer"

  if (loading) return <div className="p-10 text-center text-gray-400 italic text-sm">Cargando...</div>

  return (
    <div className="space-y-5">

      {/* Métricas */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total fallidos',       val: totalFallidos,              sub: 'En el período',      color: 'text-red-500' },
          { label: 'Monto en riesgo',      val: `$${montoRiesgo.toLocaleString()}`, sub: 'Por recuperar', color: 'text-amber-500' },
          { label: 'Reintentos promedio',  val: reintentosProm,             sub: 'Antes de bloquear',  color: 'text-blue-500' },
          { label: 'Tasa de recuperación', val: '68%',                      sub: '+4.1pp',             color: 'text-emerald-600' },
        ].map(m => (
          <div key={m.label} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-gray-400 font-medium">{m.label}</p>
            <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.val}</p>
            <p className="text-xs text-gray-400 mt-1">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Banner acción masiva */}
      {elegiblesReintento > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-red-500 text-lg">⚠</span>
            <div>
              <p className="text-sm font-black text-gray-900">Acción masiva sugerida</p>
              <p className="text-xs text-gray-500">Hay {elegiblesReintento} pagos elegibles para reintento automático (menos de 3 intentos).</p>
            </div>
          </div>
          <button className="flex items-center gap-2 border border-gray-200 bg-white rounded-xl px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
            <RefreshCw size={14}/> Reintentar pagos
          </button>
        </div>
      )}

      {/* Sub tabs */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {([
            { key: 'todo',        label: '⊙ Todo' },
            { key: 'notificados', label: '✉ Notificados' },
            { key: 'resueltos',   label: '⊙ Resueltos' },
          ] as { key: SubTab; label: string }[]).map(t => (
            <button key={t.key} onClick={() => setSubTab(t.key)}
              className={`flex-1 py-3 text-sm font-bold transition border-b-2 ${
                subTab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Header tabla */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-gray-700">{filtrados.length} Incidencias</span>
            {selected.length > 0 && (
              <span className="text-xs text-gray-400">({selected.length} seleccionadas)</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selected.length > 0 && (
              <>
                <button className="text-xs font-bold text-gray-600 border border-gray-200 rounded-xl px-3 py-1.5 hover:bg-gray-50 flex items-center gap-1">
                  <RefreshCw size={12}/> Reintentar
                </button>
                <button className="text-xs font-bold text-gray-600 border border-gray-200 rounded-xl px-3 py-1.5 hover:bg-gray-50">
                  Contactar
                </button>
                <button className="text-xs font-bold text-gray-600 border border-gray-200 rounded-xl px-3 py-1.5 hover:bg-gray-50">
                  Marcar como resueltas
                </button>
              </>
            )}
            <select className={selectCls} value={filtros.sucursal}
              onChange={e => setFiltros(p => ({ ...p, sucursal: e.target.value }))}>
              <option value="">Sucursal</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <select className={selectCls} value={filtros.motivo}
              onChange={e => setFiltros(p => ({ ...p, motivo: e.target.value }))}>
              <option value="">Motivo</option>
              {['Tarjeta expirada','Error CVV','Fondos insuficientes'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {(filtros.sucursal || filtros.motivo) && (
              <button onClick={() => setFiltros({ sucursal: '', motivo: '', estado: '' })}
                className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1">
                <X size={12}/> Limpiar
              </button>
            )}
          </div>
        </div>

        <table className="w-full text-left">
          <thead className="text-xs font-bold text-gray-400 uppercase border-b border-gray-100">
            <tr>
              <th className="px-5 py-3 w-8">
                <input type="checkbox" className="rounded"
                  checked={selected.length === filtrados.length && filtrados.length > 0}
                  onChange={e => setSelected(e.target.checked ? filtrados.map(f => f.id) : [])} />
              </th>
              <th className="px-5 py-3">Cliente</th>
              <th className="px-5 py-3">Motivo</th>
              <th className="px-5 py-3">Sucursal</th>
              <th className="px-5 py-3">Fecha</th>
              <th className="px-5 py-3">Hora</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3">Monto</th>
              <th className="px-5 py-3">Intentos</th>
              <th className="px-5 py-3">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtrados.length === 0 ? (
              <tr><td colSpan={10} className="px-5 py-12 text-center text-gray-400 italic text-sm">
                No hay pagos fallidos para este período 🎉
              </td></tr>
            ) : filtrados.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 transition">
                <td className="px-5 py-3.5">
                  <input type="checkbox" className="rounded"
                    checked={selected.includes(p.id)}
                    onChange={e => setSelected(prev =>
                      e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
                    )} />
                </td>
                <td className="px-5 py-3.5">
                  <p className="text-sm font-medium text-gray-900">{p.clientes?.nombre_completo || '—'}</p>
                  <p className="text-xs text-gray-400">{p.concepto || p.clientes?.email || '—'}</p>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600">{p.motivo_fallo || 'Sin motivo'}</td>
                <td className="px-5 py-3.5">
                  {p.sucursales ? (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg"
                      style={{ backgroundColor: `${p.sucursales.color}20`, color: p.sucursales.color }}>
                      {p.sucursales.nombre}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600">
                  {new Date(p.fecha_pago).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600">
                  {new Date(p.fecha_pago).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    (p.intentos_cobro || 0) >= 3
                      ? 'bg-gray-100 text-gray-500'
                      : 'bg-red-50 text-red-500'
                  }`}>
                    {(p.intentos_cobro || 0) >= 3 ? 'Perdido' : 'Pago fallido'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm font-bold text-gray-900">${p.monto?.toLocaleString()}</td>
                <td className="px-5 py-3.5 text-sm text-gray-600">
                  {p.intentos_cobro || 0}/3
                </td>
                <td className="px-5 py-3.5">
                  <button onClick={() => handleReintentar(p.id)}
                    disabled={(p.intentos_cobro || 0) >= 3}
                    className="flex items-center gap-1 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 disabled:opacity-30 transition">
                    <RefreshCw size={11}/> Reintentar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}