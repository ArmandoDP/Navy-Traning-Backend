'use client'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { supabase }  from '@/lib/supabase'

const TIPO_CONFIG: Record<string, { icon: string; bg: string; color: string }> = {
  pago_fallido:    { icon: '⊗', bg: '#fef2f2', color: '#ef4444' },
  lista_espera:    { icon: '⏱', bg: '#fffbeb', color: '#f59e0b' },
  membresia_vence: { icon: '⚠', bg: '#fffbeb', color: '#f59e0b' },
  retencion:       { icon: '⚑', bg: '#fffbeb', color: '#f59e0b' },
  no_show:         { icon: '⊗', bg: '#fef2f2', color: '#ef4444' },
  recordatorio:    { icon: '🔔', bg: '#eff6ff', color: '#3b82f6' },
}

type Categoria = 'todas' | 'operacion' | 'recordatorio' | 'asistencia' | 'vencimiento'

const TABS: { key: Categoria; label: string }[] = [
  { key: 'todas',        label: 'Todas'         },
  { key: 'operacion',    label: 'Operación'     },
  { key: 'recordatorio', label: 'Recordatorios' },
  { key: 'asistencia',   label: 'Asistencia'    },
  { key: 'vencimiento',  label: 'Vencimientos'  },
]

const tiempoRelativo = (fecha: string) => {
  const diff = Date.now() - new Date(fecha).getTime()
  const min  = Math.floor(diff / 60000)
  const hrs  = Math.floor(diff / 3600000)
  const dias = Math.floor(diff / 86400000)
  if (min < 60)  return `Hace ${min} min`
  if (hrs < 24)  return `Hace ${hrs}h`
  return `Hace ${dias} días`
}

interface Props {
  alertas:          any[]
  loading:          boolean
  onMarcarLeida:    (id: string) => void
  onMarcarResuelta: (id: string) => void
  onMarcarTodas:    () => void
}

export default function AlertasLista({ alertas, loading, onMarcarLeida, onMarcarResuelta, onMarcarTodas }: Props) {
  const [tab,      setTab]      = useState<Categoria>('todas')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const filtradas = tab === 'todas' ? alertas : alertas.filter(a => a.categoria === tab)
  const conteo    = (cat: Categoria) => cat === 'todas' ? alertas.length : alertas.filter(a => a.categoria === cat).length

  const getAcciones = (alerta: any) => {
    const acc = []
    if (alerta.cliente_id)  acc.push({ label: 'Ver cliente',  href: `/dashboard/clientes/${alerta.cliente_id}` })
    if (alerta.clase_id)    acc.push({ label: 'Ver clase',    href: `/dashboard/clases/${alerta.clase_id}` })
    if (alerta.sucursal_id) acc.push({ label: 'Ver sucursal', href: `/dashboard/sucursales/${alerta.sucursal_id}` })
    return acc
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
      <RefreshCw size={16} className="animate-spin" /> Cargando alertas...
    </div>
  )

  return (
    <div onClick={() => setMenuOpen(null)}>
      {alertas.some(a => !a.leida) && (
        <div className="flex justify-end mb-3">
          <button onClick={onMarcarTodas}
            className="text-xs font-bold text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 transition">
            Marcar todas como leídas
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="grid grid-cols-5 border-b border-gray-100">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center justify-center gap-1.5 px-5 py-4 text-sm font-medium transition border-b-2 whitespace-nowrap ${
                tab === t.key
                  ? 'border-gray-900 text-gray-900 font-bold'
                  : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}>
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                tab === t.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {conteo(t.key)}
              </span>
            </button>
          ))}
        </div>

        {filtradas.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm italic">
            No hay alertas pendientes
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtradas.map(alerta => {
              const cfg     = TIPO_CONFIG[alerta.tipo] || TIPO_CONFIG['recordatorio']
              const acciones = getAcciones(alerta)
              return (
                <div key={alerta.id}
                  className={`flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition relative ${
                    !alerta.leida ? 'bg-white' : 'bg-gray-50/30'
                  }`}>
                  {!alerta.leida && (
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  )}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-lg"
                    style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!alerta.leida ? 'font-black text-gray-900' : 'font-semibold text-gray-700'}`}>
                      {alerta.titulo}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{alerta.descripcion}</p>
                    <p className="text-[11px] text-gray-300 mt-1">{tiempoRelativo(alerta.created_at)}</p>
                  </div>
                  <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setMenuOpen(menuOpen === alerta.id ? null : alerta.id)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition text-lg leading-none">
                      ⋮
                    </button>
                    {menuOpen === alerta.id && (
                      <div className="absolute right-0 top-8 z-10 bg-white border border-gray-100 rounded-2xl shadow-xl py-1.5 min-w-[180px]">
                        {acciones.map(a => (
                          <a key={a.href} href={a.href}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition">
                            → {a.label}
                          </a>
                        ))}
                        {acciones.length > 0 && <div className="border-t border-gray-100 my-1" />}
                        {!alerta.leida && (
                          <button onClick={() => onMarcarLeida(alerta.id)}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition text-left">
                            ✓ Marcar como leída
                          </button>
                        )}
                        <button onClick={() => onMarcarResuelta(alerta.id)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition text-left">
                          ✓ Marcar como resuelta
                        </button>
                        <button onClick={() => onMarcarResuelta(alerta.id)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition text-left">
                          ✕ Ignorar alerta
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}