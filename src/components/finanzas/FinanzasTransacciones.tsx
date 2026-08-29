'use client'
import { useEffect, useState } from 'react'
import { supabase }            from '@/lib/supabase'
import { X, ChevronRight, ChevronLeft } from 'lucide-react'

interface Props { fechaInicio: string; fechaFin: string, sucursalId: string | null }

const selectCls = "border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none bg-white focus:border-gray-400 appearance-none cursor-pointer"

export default function FinanzasTransacciones({ fechaInicio, fechaFin, sucursalId }: Props) {
  const [loading,    setLoading]    = useState(true)
  const [pagos,      setPagos]      = useState<any[]>([])
  const [sucursales, setSucursales] = useState<any[]>([])
  const [pagoActivo, setPagoActivo] = useState<any | null>(null)
  const [page,       setPage]       = useState(1)
  const [filtros,    setFiltros]    = useState({ sucursal: '', tipo: '', estado: '' })
  const PER_PAGE = 10

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)

      let qPagos = supabase.from('pagos')
        .select('id, monto, estatus, fecha_pago, canal, concepto, metodo_pago, sucursal_id, stripe_payment_intent_id, cliente_id, clientes(nombre_completo), sucursales(nombre, color)')
        .gte('fecha_pago', fechaInicio)
        .lte('fecha_pago', fechaFin + 'T23:59:59')
        .not('cliente_id', 'is', null)
        .order('fecha_pago', { ascending: false })
      if (sucursalId) qPagos = qPagos.eq('sucursal_id', sucursalId)

      const [{ data: pagosData }, { data: sucsData }] = await Promise.all([
        qPagos,
        supabase.from('sucursales').select('id, nombre, color').eq('estatus', 'Activa'),
      ])
      if (pagosData) setPagos(pagosData)
      if (sucsData)  setSucursales(sucsData)
      setLoading(false)
    }
    fetch()
  }, [fechaInicio, fechaFin, sucursalId])

  const filtrados = pagos.filter(p =>
    (!filtros.sucursal || p.sucursal_id === filtros.sucursal) &&
    (!filtros.tipo     || p.metodo_pago === filtros.tipo) &&
    (!filtros.estado   || p.estatus === filtros.estado)
  )

  const totalPages = Math.ceil(filtrados.length / PER_PAGE)
  const paginated  = filtrados.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  if (loading) return <div className="p-10 text-center text-gray-400 italic text-sm">Cargando...</div>

  return (
    <div className="relative">
      {/* Drawer detalle */}
      {pagoActivo && (
        <>
          <div onClick={() => setPagoActivo(null)} className="fixed inset-0 z-40 bg-black/20" />
          <div className="fixed top-0 right-0 z-50 h-full w-96 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <p className="text-sm font-black text-gray-900">Detalle de transacción</p>
                <p className="text-xs text-gray-400">txn_{pagoActivo.id?.slice(0,7)}</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${
                  pagoActivo.estatus === 'Completado' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                }`}>{pagoActivo.estatus}</span>
              </div>
              <button onClick={() => setPagoActivo(null)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                <X size={16}/>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div className="text-center py-4">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">
                  {pagoActivo.concepto || 'Pago'}
                </p>
                <p className="text-4xl font-black text-gray-900">${pagoActivo.monto?.toLocaleString()}</p>
              </div>
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Datos de la compra</p>
                {[
                  { label: 'Nombre completo',  val: pagoActivo.clientes?.nombre_completo || '—' },
                  { label: 'Sucursal',         val: pagoActivo.sucursales?.nombre || '—', color: pagoActivo.sucursales?.color },
                  { label: 'Método de pago',   val: `${pagoActivo.metodo_pago || '—'}` },
                  { label: 'Fecha y hora',     val: pagoActivo.fecha_pago ? new Date(pagoActivo.fecha_pago).toLocaleString('es-MX') : '—' },
                  { label: 'ID de Stripe',     val: pagoActivo.stripe_payment_intent_id || pagoActivo.stripe_invoice_id || '—' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">{r.label}</span>
                    {r.color ? (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg"
                        style={{ backgroundColor: `${r.color}20`, color: r.color }}>{r.val}</span>
                    ) : (
                      <span className="text-sm font-medium text-gray-900 text-right max-w-[180px] truncate">{r.val}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
                Reembolsar
              </button>
              <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition"
                style={{ backgroundColor: '#171B24' }}>
                Descargar recibo
              </button>
            </div>
          </div>
        </>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Header + Filtros */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-black text-gray-900">
            Últimas transacciones <span className="text-gray-400 font-normal text-xs">(En vivo · Stripe)</span>
          </p>
          <div className="flex items-center gap-2">
            <select className={selectCls} value={filtros.sucursal}
              onChange={e => setFiltros(p => ({ ...p, sucursal: e.target.value }))}>
              <option value="">Sucursal</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <select className={selectCls} value={filtros.tipo}
              onChange={e => setFiltros(p => ({ ...p, tipo: e.target.value }))}>
              <option value="">Tipo</option>
              {['Stripe','Efectivo','Transferencia','OXXO'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className={selectCls} value={filtros.estado}
              onChange={e => setFiltros(p => ({ ...p, estado: e.target.value }))}>
              <option value="">Estado</option>
              {['Completado','Fallido','Pendiente'].map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            {(filtros.sucursal || filtros.tipo || filtros.estado) && (
              <button onClick={() => setFiltros({ sucursal: '', tipo: '', estado: '' })}
                className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1">
                <X size={12}/> Limpiar
              </button>
            )}
          </div>
        </div>

        <table className="w-full text-left">
          <thead className="text-xs font-bold text-gray-400 uppercase border-b border-gray-100">
            <tr>
              <th className="px-5 py-3">Fecha</th>
              <th className="px-5 py-3">Hora</th>
              <th className="px-5 py-3">Cliente</th>
              <th className="px-5 py-3">Concepto</th>
              <th className="px-5 py-3">Sucursal</th>
              <th className="px-5 py-3">Método</th>
              <th className="px-5 py-3">Monto</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3 w-8"/>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paginated.length === 0 ? (
              <tr><td colSpan={9} className="px-5 py-12 text-center text-gray-400 italic text-sm">
                No hay transacciones para este período
              </td></tr>
            ) : paginated.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 transition cursor-pointer" onClick={() => setPagoActivo(p)}>
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
                  ) : '—'}
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600">{p.metodo_pago || '—'}</td>
                <td className="px-5 py-3.5 text-sm font-black text-gray-900">${p.monto?.toLocaleString()}</td>
                <td className="px-5 py-3.5">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    p.estatus === 'Completado' ? 'bg-emerald-50 text-emerald-600' :
                    p.estatus === 'Fallido'    ? 'bg-red-50 text-red-500' :
                    'bg-amber-50 text-amber-600'
                  }`}>{p.estatus}</span>
                </td>
                <td className="px-5 py-3.5">
                  <ChevronRight size={16} className="text-gray-300" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Paginación */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 disabled:opacity-30 transition">
            <ChevronLeft size={16}/>
          </button>
          <span className="text-xs text-gray-400">Página {page} de {totalPages || 1}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 disabled:opacity-30 transition">
            <ChevronRight size={16}/>
          </button>
        </div>
      </div>
    </div>
  )
}