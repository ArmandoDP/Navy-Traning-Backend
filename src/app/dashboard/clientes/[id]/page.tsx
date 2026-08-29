'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'

export default function PerfilCliente() {
  const { id } = useParams() // Obtenemos el ID de la URL
  const [cliente, setCliente] = useState<any>(null)
  const [pagos, setPagos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchFullProfile = async () => {
      // Traemos la info personal
      const { data: info } = await supabase.from('clientes').select('*').eq('id', id).single()
      // Traemos el historial de pagos
      const { data: histPagos } = await supabase.from('pagos').select('*').eq('cliente_id', id).order('fecha_pago', { ascending: false })
      
      if (histPagos) setPagos(histPagos);
      setCliente(info)
      setPagos(histPagos || [])
      setLoading(false)
    }
    fetchFullProfile()
  }, [id])

  // Cálculo de LTV (Valor de Cliente) dinámico
  const totalPagado = pagos.reduce((acc, curr) => acc + Number(curr.monto), 0);

  if (loading) return <div className="p-10 text-zinc-500 italic">Cargando expediente Navy...</div>
  if (!cliente) return <div className="p-10 text-red-500">Socio no encontrado.</div>

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* HEADER: Información Personal Rápida */}
      <div className="flex justify-between items-start border-b border-zinc-800 pb-8">
        <div>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase">{cliente.nombre_completo}</h1>
          <p className="text-zinc-500 font-mono text-sm">{cliente.email} • {cliente.telefono || 'Sin teléfono'}</p>
          <div className="mt-4 flex gap-2">
            <span className="px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-bold uppercase">
              {cliente.estatus || 'Activo'}
            </span>
            <span className="px-3 py-1 bg-zinc-800 text-zinc-400 rounded-full text-xs font-bold uppercase">
              Plan: {cliente.plan}
            </span>
          </div>
        </div>
        <button className="bg-white text-black px-6 py-2 rounded-xl font-bold text-sm hover:bg-zinc-200">
          EDITAR PERFIL
        </button>
      </div>

      {/* MÉTRICAS (Basado en tu diagrama) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Valor de Cliente (LTV)</p>
          <p className="text-2xl font-black mt-1">${totalPagado.toFixed(2)}</p>
        </div>
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Antigüedad</p>
          <p className="text-2xl font-black mt-1">
            {Math.floor((new Date().getTime() - new Date(cliente.created_at).getTime()) / (1000 * 3600 * 24))} Días
          </p>
        </div>
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Asistencias este mes</p>
          <p className="text-2xl font-black mt-1">--</p> 
        </div>
      </div>

      {/* SECCIÓN DE HISTORIALES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Historial de Pagos */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold uppercase tracking-tighter italic">Historial de Pagos</h3>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden mt-4">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 text-zinc-500 uppercase text-[10px] font-bold">
                <tr>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Monto</th>
                  <th className="p-4">Método</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {pagos.length > 0 ? pagos.map((p) => (
                  <tr key={p.id}>
                    <td className="p-4">{new Date(p.fecha_pago).toLocaleDateString()}</td>
                    <td className="p-4 font-bold text-green-500">${p.monto}</td>
                    <td className="p-4 text-zinc-500">{p.metodo_pago}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-zinc-600 italic">No hay pagos registrados</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Atención al Cliente / Notas */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold uppercase tracking-tighter italic">Atención al Cliente</h3>
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
            <textarea 
              placeholder="Agregar nota sobre renovación o queja..."
              className="w-full bg-black border border-zinc-800 rounded-xl p-4 text-sm text-white outline-none focus:border-zinc-500 h-32"
            />
            <button className="mt-4 w-full bg-zinc-800 text-white py-2 rounded-xl font-bold text-sm hover:bg-zinc-700">
              GUARDAR NOTA
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}