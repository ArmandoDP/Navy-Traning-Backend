'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  integ:     any
  onRefresh: () => void
}

export default function IntegracionConfiguracion({ integ, onRefresh }: Props) {
  const [editando, setEditando] = useState(false)
  const [apiKey,   setApiKey]   = useState(integ.api_key || '')
  const [modo,     setModo]     = useState(integ.modo || 'Produccion')
  const [saving,   setSaving]   = useState(false)

  const handleGuardar = async () => {
    setSaving(true)
    await supabase.from('integraciones').update({
      api_key:        apiKey,
      modo,
      ultima_sync:    new Date().toISOString(),
      webhook_activo: true,
    }).eq('id', integ.id)
    onRefresh()
    setEditando(false)
    setSaving(false)
  }

  const tiempoSync = (fecha: string) => {
    if (!fecha) return 'Nunca'
    const diff = Date.now() - new Date(fecha).getTime()
    const min  = Math.floor(diff / 60000)
    const hrs  = Math.floor(diff / 3600000)
    if (min < 60) return `Hace ${min} min`
    if (hrs < 24) return `Hace ${hrs}h`
    return new Date(fecha).toLocaleDateString('es-MX')
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <p className="text-sm font-black text-gray-700">⚙ Configuración</p>
        {!editando && (
          <button onClick={() => setEditando(true)}
            className="text-xs font-bold text-indigo-500 hover:text-indigo-700 transition">
            Editar
          </button>
        )}
      </div>

      <div className="divide-y divide-gray-50">

        {/* Estado webhook */}
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-sm text-gray-600">Estado del Webhook</p>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
            integ.webhook_activo
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {integ.webhook_activo ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        {/* Última sync */}
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-sm text-gray-600">Última sincronización</p>
          <p className="text-sm font-bold text-gray-800">{tiempoSync(integ.ultima_sync)}</p>
        </div>

        {/* Modo */}
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-sm text-gray-600">Modo</p>
          {editando ? (
            <select value={modo} onChange={e => setModo(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-gray-400 bg-gray-50">
              <option value="Produccion">Producción</option>
              <option value="Sandbox">Sandbox</option>
            </select>
          ) : (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              integ.modo === 'Produccion'
                ? 'bg-indigo-50 text-indigo-600'
                : 'bg-amber-50 text-amber-600'
            }`}>
              {integ.modo === 'Produccion' ? 'Producción' : 'Sandbox'}
            </span>
          )}
        </div>

        {/* API Key */}
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-sm text-gray-600">API key</p>
          {editando ? (
            <input value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="sk_live_..."
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-mono text-gray-700 outline-none focus:border-gray-400 bg-gray-50 w-64" />
          ) : (
            <p className="text-xs font-mono text-gray-500">
              {integ.api_key ? `API-KEY+${integ.api_key.slice(0, 12)}...` : '—'}
            </p>
          )}
        </div>
      </div>

      {/* Footer edición */}
      {editando && (
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={() => setEditando(false)}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition"
            style={{ backgroundColor: '#171B24' }}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </div>
  )
}