'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSucursal } from '@/context/SucursalContext'
import { Plus } from 'lucide-react'
import ReservasMetricas  from '@/components/reservas/ReservasMetricas'
import ReservasPaneles   from '@/components/reservas/ReservasPaneles'
import ReservasTabla     from '@/components/reservas/ReservasTabla'
import ModalCrearReserva from '@/components/ModalCrearReserva'

export default function ReservasPage() {
  const { sucursalId, sucursalActiva } = useSucursal()

  const [reservas,  setReservas]  = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const fetchReservas = async () => {
    setLoading(true)
    let q = supabase
      .from('reservas')
      .select('*, clientes(id, nombre_completo, email, telefono), clases(id, nombre_clase, horario, tipo_clase, sucursal_id, sucursales(nombre, ciudad))')
      .order('created_at', { ascending: false })

    // Filtrar por sucursal via clases
    if (sucursalId) {
      const { data: claseIds } = await supabase.from('clases').select('id').eq('sucursal_id', sucursalId)
      const ids = (claseIds || []).map((c: any) => c.id)
      if (ids.length > 0) q = q.in('clase_id', ids)
      else { setReservas([]); setLoading(false); return }
    }

    const { data, error } = await q
    if (!error && data) setReservas(data)
    setLoading(false)
  }

  useEffect(() => { fetchReservas() }, [sucursalId])

  const activas    = reservas.filter(r => r.estatus !== 'Cancelada' && !r.lista_espera)
  const canceladas = reservas.filter(r => r.estatus === 'Cancelada')
  const noShows    = reservas.filter(r => r.lista_espera)
  const tasa       = activas.length > 0 ? Math.round(((activas.length - noShows.length) / activas.length) * 100) : 0

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm italic">Cargando reservas...</div>

  return (
    <div className="space-y-5 bg-gray-50 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Reservas</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {sucursalActiva ? `${sucursalActiva.nombre}, ${sucursalActiva.ciudad}` : 'Todas las sucursales'}
          </p>
        </div>
        <button onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition">
          <Plus size={16}/> Nueva reserva
        </button>
      </div>

      <ReservasMetricas reservas={activas.length} cancelaciones={canceladas.length} noShows={noShows.length} tasaAsistencia={tasa} />
      <ReservasPaneles />
      <ReservasTabla reservas={reservas} onRefresh={fetchReservas} />

      <ModalCrearReserva isOpen={modalOpen} onClose={() => setModalOpen(false)} onSuccess={fetchReservas} />
    </div>
  )
}