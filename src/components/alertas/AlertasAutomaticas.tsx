'use client'
import { useEffect, useState } from 'react'
import { supabase }            from '@/lib/supabase'
import { RefreshCw, Bell, Mail, Smartphone } from 'lucide-react'

const ICONOS: Record<string, string> = {
  recordatorio_clase_1d: '📅',
  recordatorio_clase_1h: '⏰',
  membresia_vence_7d:    '⚠️',
  membresia_vence_3d:    '⚠️',
  membresia_vence_1d:    '🔴',
  pago_fallido:          '❌',
  reserva_confirmada:    '✅',
  clase_cancelada:       '🚫',
  bienvenida:            '👋',
}

const GRUPOS = [
  { label: 'Recordatorios de clase', tipos: ['recordatorio_clase_1d', 'recordatorio_clase_1h', 'reserva_confirmada', 'clase_cancelada'] },
  { label: 'Membresías',             tipos: ['membresia_vence_7d', 'membresia_vence_3d', 'membresia_vence_1d'] },
  { label: 'Pagos',                  tipos: ['pago_fallido'] },
  { label: 'Onboarding',             tipos: ['bienvenida'] },
]

export default function AlertasAutomaticas() {
  const [configs,  setConfigs]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState<string | null>(null)

  useEffect(() => {
    supabase.from('alertas_config').select('*').order('tipo')
      .then(({ data }) => { if (data) setConfigs(data); setLoading(false) })
  }, [])

  const toggleActiva = async (id: string, activa: boolean) => {
    setSaving(id)
    await supabase.from('alertas_config').update({ activa: !activa }).eq('id', id)
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, activa: !activa } : c))
    setSaving(null)
  }

  const toggleCanal = async (id: string, canal: string, canales: string[]) => {
    setSaving(id)
    const nuevos = canales.includes(canal)
      ? canales.filter(c => c !== canal)
      : [...canales, canal]
    await supabase.from('alertas_config').update({ canales: nuevos }).eq('id', id)
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, canales: nuevos } : c))
    setSaving(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-40 text-gray-400 gap-2 text-sm">
      <RefreshCw size={14} className="animate-spin" /> Cargando configuración...
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4">
        <p className="text-sm font-bold text-amber-800 mb-1">⚡ Alertas automáticas</p>
        <p className="text-xs text-amber-600">
          Estas alertas se envían automáticamente según los eventos y horarios configurados. 
          Actívalas o desactívalas según las necesidades de Navy.
        </p>
      </div>

      {GRUPOS.map(grupo => {
        const items = configs.filter(c => grupo.tipos.includes(c.tipo))
        if (items.length === 0) return null
        return (
          <div key={grupo.label} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <p className="text-xs font-black text-gray-500 uppercase tracking-widest">{grupo.label}</p>
            </div>
            <div className="divide-y divide-gray-50">
              {items.map(config => (
                <div key={config.id} className="flex items-center gap-4 px-5 py-4">
                  <span className="text-xl flex-shrink-0">{ICONOS[config.tipo] || '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">{config.nombre}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{config.descripcion}</p>
                    {/* Canales */}
                    <div className="flex items-center gap-2 mt-2">
                      {[
                        { key: 'push',   icon: <Smartphone size={10}/>, label: 'Push'   },
                        { key: 'correo', icon: <Mail size={10}/>,        label: 'Correo' },
                        { key: 'campana',icon: <Bell size={10}/>,        label: 'CRM'    },
                      ].map(canal => {
                        const activo = config.canales?.includes(canal.key)
                        return (
                          <button
                            key={canal.key}
                            onClick={() => toggleCanal(config.id, canal.key, config.canales || [])}
                            disabled={saving === config.id || !config.activa}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition border ${
                              activo
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-gray-50 text-gray-400 border-gray-200'
                            } disabled:opacity-50`}>
                            {canal.icon} {canal.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {/* Toggle activa */}
                  <button
                    onClick={() => toggleActiva(config.id, config.activa)}
                    disabled={saving === config.id}
                    className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                        config.activa ? 'bg-emerald-500' : 'bg-gray-200'
                    } disabled:opacity-50`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
                        config.activa ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                    </button>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}