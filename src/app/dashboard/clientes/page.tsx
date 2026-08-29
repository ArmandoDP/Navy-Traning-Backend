'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSucursal } from '@/context/SucursalContext'
import { Upload, Plus, RefreshCw } from 'lucide-react'
import ClientesMetricas   from '@/components/clientes/ClientesMetricas'
import ClientesTabla      from '@/components/clientes/ClientesTabla'
import DrawerNuevoCliente from '@/components/clientes/DrawerNuevoCliente'
import DrawerEditarCliente from '@/components/clientes/DrawerEditarCliente'
import DrawerCliente      from '@/components/clientes/drawer/DrawerCliente'

export default function ClientesPage() {
  const { sucursalId, sucursalActiva } = useSucursal()

  const [clientes,        setClientes]        = useState<any[]>([])
  const [loading,         setLoading]         = useState(true)
  const [nuevoOpen,       setNuevoOpen]       = useState(false)
  const [drawerClienteId, setDrawerClienteId] = useState<string | null>(null)
  const [drawerOpen,      setDrawerOpen]      = useState(false)
  const [editarCliente,   setEditarCliente]   = useState<any | null>(null)
  const [editarOpen,      setEditarOpen]      = useState(false)

  const fetchClientes = async () => {
    setLoading(true)
    let q = supabase
      .from('clientes')
      .select('*, sucursales(nombre, color), pagos(monto, estatus), membresias(id, fecha_inicio, fecha_fin, estatus, origen, paquete_id, notas, paquetes(nombre))')
      .order('created_at', { ascending: false })
    if (sucursalId) q = q.eq('sucursal_id', sucursalId)
    const { data, error } = await q
    if (!error && data) setClientes(data)
    setLoading(false)
  }

  useEffect(() => { fetchClientes() }, [sucursalId])

  // ── Exportar CSV ─────────────────────────────────────────────────────────────
  const handleExportar = () => {
    const headers = ['Nombre','Email','Sucursal','Plan','Estatus','Asistencia %','Valor','Alta']
    const rows = clientes.map(c => [
      c.nombre_completo, c.email,
      c.sucursales?.nombre || '', c.plan || '',
      c.perdido ? 'Perdido' : c.estatus,
      c.asistencia_pct || 0, c.valor_cliente || 0,
      new Date(c.created_at).toLocaleDateString('es-MX'),
    ])
    const csv  = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `clientes-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────────
  const handleRenovar = async (ids: string[]) => {
    for (const id of ids) {
      const c = clientes.find(x => x.id === id)
      if (!c) continue
      const fecha = c.fecha_vencimiento_memb ? new Date(c.fecha_vencimiento_memb) : new Date()
      fecha.setDate(fecha.getDate() + 30)
      await supabase.from('clientes').update({ fecha_vencimiento_memb: fecha.toISOString(), estatus: 'Activo' }).eq('id', id)
    }
    fetchClientes()
  }

  const handleMarcarPerdido = async (ids: string[]) => {
    await supabase.from('clientes').update({ perdido: true, estatus: 'Inactivo' }).in('id', ids)
    fetchClientes()
  }

  const handleCambiarPaquete = (ids: string[]) => {
    console.log('Cambiar paquete para:', ids)
  }

  // ── Abrir drawer ver cliente ──────────────────────────────────────────────────
  const handleVerCliente = (cliente: any) => {
    setDrawerClienteId(cliente.id)   // ← antes era solo id
    setDrawerOpen(true)
  }

  const handleEditarCliente = (cliente: any) => {
    setEditarCliente(cliente)
    setEditarOpen(true)
  }
  
  // ── Abrir drawer editar desde el drawer de ver ────────────────────────────────
  const handleEditarDesdeDrawer = (cliente: any) => {
    setDrawerOpen(false)
    setEditarCliente(cliente)
    setEditarOpen(true)
  }

  // ── Métricas ──────────────────────────────────────────────────────────────────
  const activos       = clientes.filter(c => c.estatus === 'Activo' && !c.perdido).length
  const expirados     = clientes.filter(c => {
    const f = c.fecha_vencimiento_memb || c.fecha_venc_plan
    return f && new Date(f) < new Date() && !c.perdido
  }).length
  const pagosFallidos = clientes.filter(c => c.pagos?.some((p: any) => p.estatus === 'Fallido')).length
  const perdidos      = clientes.filter(c => c.perdido).length

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
      <RefreshCw size={16} className="animate-spin"/> Cargando clientes...
    </div>
  )

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Clientes</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Gestión de clientes y renovación de membresías
            {sucursalActiva && ` · ${sucursalActiva.nombre}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportar}
            className="flex items-center gap-2 border border-gray-200 bg-white text-gray-700 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-gray-50 transition">
            <Upload size={15}/> Exportar
          </button>
          <button onClick={() => setNuevoOpen(true)}
            className="flex items-center gap-2 btn-dark font-bold text-sm px-4 py-2.5 rounded-xl transition">
            <Plus size={15}/> Nuevo cliente
          </button>
        </div>
      </div>

      {/* Métricas */}
      <ClientesMetricas
        activos={activos}
        expirados={expirados}
        pagosFallidos={pagosFallidos}
        perdidos={perdidos}
      />

      {/* Tabla — pasa onVerCliente para abrir el drawer */}
      <ClientesTabla
        clientes={clientes}
        onRefresh={fetchClientes}
        onRenovar={handleRenovar}
        onMarcarPerdido={handleMarcarPerdido}
        onCambiarPaquete={handleCambiarPaquete}
        onVerCliente={handleVerCliente}       // ← ya estaba
        onEditarCliente={handleEditarCliente} // ← nuevo
      />

      {/* Drawer nuevo cliente */}
      <DrawerNuevoCliente
        isOpen={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        onSuccess={fetchClientes}
      />

      {/* Drawer ver cliente */}
      <DrawerCliente
        clienteId={drawerClienteId}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onEditar={handleEditarDesdeDrawer}
      />

      {/* Drawer editar cliente */}
      <DrawerEditarCliente
        isOpen={editarOpen}
        cliente={editarCliente}
        onClose={() => { setEditarOpen(false); setEditarCliente(null) }}
        onSuccess={() => {
          fetchClientes()
          setEditarOpen(false)
          setEditarCliente(null)
        }}
      />
    </div>
  )
}