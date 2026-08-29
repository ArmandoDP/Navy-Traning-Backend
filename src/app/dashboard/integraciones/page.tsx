'use client'
import { useEffect, useState }    from 'react'
import { supabase }               from '@/lib/supabase'
import { RefreshCw }              from 'lucide-react'
import IntegracionesMetricas      from '@/components/integraciones/IntegracionesMetricas'
import IntegracionesGrid          from '@/components/integraciones/IntegracionesGrid'

export default function IntegracionesPage() {
  const [integraciones, setIntegraciones] = useState<any[]>([])
  const [loading,       setLoading]       = useState(true)

  const fetchIntegraciones = async () => {
    setLoading(true)
    const { data } = await supabase.from('integraciones').select('*').order('created_at')
    if (data) setIntegraciones(data)
    setLoading(false)
  }

  useEffect(() => { fetchIntegraciones() }, [])

  const handleDesconectar = async (id: string) => {
    if (!confirm('¿Desconectar esta integración?')) return
    await supabase.from('integraciones').update({ estatus: 'Desconectada' }).eq('id', id)
    fetchIntegraciones()
  }

  const handleConectar = async (id: string) => {
    await supabase.from('integraciones').update({ estatus: 'Conectada' }).eq('id', id)
    fetchIntegraciones()
  }

  const total         = integraciones.length
  const conectadas    = integraciones.filter(i => i.estatus === 'Conectada').length
  const atencion      = integraciones.filter(i => i.estatus === 'Atencion').length
  const desconectadas = integraciones.filter(i => i.estatus === 'Desconectada').length

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
      <RefreshCw size={16} className="animate-spin" /> Cargando integraciones...
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Integraciones</h1>
        <p className="text-gray-400 text-sm mt-0.5">Gestiona tus integraciones</p>
      </div>

      <IntegracionesMetricas
        total={total}
        conectadas={conectadas}
        atencion={atencion}
        desconectadas={desconectadas}
      />

      <IntegracionesGrid
        integraciones={integraciones}
        onConectar={handleConectar}
        onDesconectar={handleDesconectar}
      />
    </div>
  )
}