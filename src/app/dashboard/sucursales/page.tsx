'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import SucursalCardTop from '@/components/sucursales/SucursalCardTop'
import SucursalCardDetalle from '@/components/sucursales/SucursalCardDetalle'
import DrawerSucursal from '@/components/sucursales/DrawerSucursal'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Sucursal {
  id: string
  nombre: string
  ciudad: string
  direccion: string
  gerente: string
  telefono: string
  email: string
  capacidad: number
  estatus: string
  created_at: string
  color: string
}

interface SucursalStats extends Sucursal {
  ingresos: number
  crecimiento: number
  retencion: number
  totalClientes: number
  activos: number
  lost: number
  failed: number
  expired: number
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function SucursalesPage() {
  const [sucursales, setSucursales]   = useState<SucursalStats[]>([])
  const [loading, setLoading]         = useState(true)
  const [modalOpen, setModalOpen]     = useState(false)
  const [sucursalEdit, setSucursalEdit] = useState<any>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchSucursales = async () => {
    setLoading(true)

    const { data: suc, error } = await supabase
      .from('sucursales')
      .select('*')
      .order('created_at', { ascending: true })

    if (error || !suc) { setLoading(false); return }

    // Para cada sucursal, traemos sus clientes y pagos
    const stats = await Promise.all(suc.map(async (s) => {
      
      const { data: clientes } = await supabase
        .from('clientes')
        .select('id, estatus')
        .eq('sucursal_id', s.id)

      const { data: pagos } = await supabase
        .from('pagos')
        .select('monto, fecha_pago, cliente_id')
        .in('cliente_id', (clientes || []).map(c => c.id))

      const totalClientes = clientes?.length || 0
      const activos  = clientes?.filter(c => c.estatus === 'Activo').length   || 0
      const lost     = clientes?.filter(c => c.estatus === 'Inactivo').length || 0
      const failed   = clientes?.filter(c => c.estatus === 'Vencido').length  || 0
      const expired  = totalClientes - activos - lost - failed

      // Ingresos totales
      const ingresos = pagos?.reduce((a, p) => a + Number(p.monto), 0) || 0

      // Ingresos mes actual vs mes anterior para crecimiento
      const ahora      = new Date()
      const inicioMes  = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString()
      const inicioAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1).toISOString()
      const finAnterior    = new Date(ahora.getFullYear(), ahora.getMonth(), 0).toISOString()

      const ingresosMes      = pagos?.filter(p => p.fecha_pago >= inicioMes).reduce((a, p) => a + Number(p.monto), 0) || 0
      const ingresosAnterior = pagos?.filter(p => p.fecha_pago >= inicioAnterior && p.fecha_pago <= finAnterior).reduce((a, p) => a + Number(p.monto), 0) || 0

      const crecimiento = ingresosAnterior > 0
        ? Math.round(((ingresosMes - ingresosAnterior) / ingresosAnterior) * 100)
        : 0

      const retencion = totalClientes > 0 ? Math.round((activos / totalClientes) * 100) : 0

      return { ...s, ingresos, crecimiento, retencion, totalClientes, activos, lost, failed, expired: Math.max(expired, 0) }
    }))

    setSucursales(stats)
    setLoading(false)
  }

  useEffect(() => { fetchSucursales() }, [])

  const handleEditar = (s: SucursalStats) => {
    setSucursalEdit(s)
    setModalOpen(true)
  }

  const handleCerrarModal = () => {
    setModalOpen(false)
    setSucursalEdit(null)
  }

  if (loading) return <div className="p-10 text-zinc-500 italic">Cargando sucursales Navy...</div>

  return (
    <div className="p-6 space-y-6 bg-zinc-50 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-zinc-900">Sucursales</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Visión general de todas las sucursales</p>
        </div>
        <button
          onClick={() => { setSucursalEdit(null); setModalOpen(true) }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition"
        >
          + Nueva sucursal
        </button>
      </div>

      {/* Cards top — ingresos rápidos */}
      {sucursales.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {sucursales.map(s => (
            <SucursalCardTop
              key={s.id}
              nombre={s.nombre}
              ciudad={s.ciudad}
              ingresos={s.ingresos}
              crecimiento={s.crecimiento}
              color={s.color}
            />
          ))}
        </div>
      )}

      {/* Cards detalle */}
      {sucursales.length === 0 ? (
        <div className="text-center py-20 text-zinc-400 italic">
          No hay sucursales registradas. ¡Crea la primera!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sucursales.map(s => (
            <SucursalCardDetalle
              key={s.id}
              id={s.id}
              nombre={s.nombre}
              ciudad={s.ciudad}
              gerente={s.gerente}
              estatus={s.estatus}
              ingresos={s.ingresos}
              retencion={s.retencion}
              crecimiento={s.crecimiento}
              capacidad={s.capacidad}
              totalClientes={s.totalClientes}
              activos={s.activos}
              lost={s.lost}
              failed={s.failed}
              expired={s.expired}
              onEditar={() => handleEditar(s)}
              color={s.color}
            />
          ))}
        </div>
      )}

      {/* Modal crear / editar */}
      <DrawerSucursal
        isOpen={modalOpen}
        onClose={handleCerrarModal}
        onSuccess={() => { handleCerrarModal(); fetchSucursales() }}
        sucursal={sucursalEdit}
      />
    </div>
  )
}