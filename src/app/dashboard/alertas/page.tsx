'use client'
import { useEffect, useState }    from 'react'
import { supabase }               from '@/lib/supabase'
import { Bell, Zap, Megaphone }   from 'lucide-react'
import AlertasLista               from '@/components/alertas/AlertasLista'
import AlertasAutomaticas         from '@/components/alertas/AlertasAutomaticas'
import AlertasAnuncios            from '@/components/alertas/AlertasAnuncios'

type Tab = 'alertas' | 'automaticas' | 'anuncios'

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'alertas',      label: 'Alertas',      icon: <Bell size={14}/>      },
  { key: 'automaticas',  label: 'Automáticas',  icon: <Zap size={14}/>       },
  { key: 'anuncios',     label: 'Anuncios',     icon: <Megaphone size={14}/> },
]

export default function AlertasPage() {
  const [tab,     setTab]     = useState<Tab>('alertas')
  const [alertas, setAlertas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAlertas = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('alertas')
      .select('*, clientes(nombre_completo), clases(nombre_clase), sucursales(nombre)')
      .eq('resuelta', false)
      .order('created_at', { ascending: false })
    if (data) setAlertas(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchAlertas()
    const channel = supabase.channel('alertas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas' }, fetchAlertas)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const marcarLeida = async (id: string) => {
    await supabase.from('alertas').update({ leida: true }).eq('id', id)
    setAlertas(prev => prev.map(a => a.id === id ? { ...a, leida: true } : a))
  }

  const marcarResuelta = async (id: string) => {
    await supabase.from('alertas').update({ resuelta: true }).eq('id', id)
    setAlertas(prev => prev.filter(a => a.id !== id))
  }

  const marcarTodas = async () => {
    await supabase.from('alertas').update({ leida: true }).eq('leida', false)
    setAlertas(prev => prev.map(a => ({ ...a, leida: true })))
  }

  const noLeidas = alertas.filter(a => !a.leida).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Alertas</h1>
          <p className="text-gray-400 text-sm mt-0.5">Centro de notificaciones y anuncios</p>
        </div>
      </div>

      {/* Tabs principales */}
      <div className="flex gap-2">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition border ${
              tab === t.key
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}>
            {t.icon}
            {t.label}
            {t.key === 'alertas' && noLeidas > 0 && (
              <span className="bg-red-500 text-white text-xs font-black px-1.5 py-0.5 rounded-full">
                {noLeidas}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'alertas'     && <AlertasLista alertas={alertas} loading={loading} onMarcarLeida={marcarLeida} onMarcarResuelta={marcarResuelta} onMarcarTodas={marcarTodas} />}
      {tab === 'automaticas' && <AlertasAutomaticas />}
      {tab === 'anuncios'    && <AlertasAnuncios />}
    </div>
  )
}