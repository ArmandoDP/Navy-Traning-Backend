'use client'
import { useCallback, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Props {
  form:       any
  set:        (k: string, v: any) => void
  series:     { id: string; nombre: string; color: string }[]
  onRefreshCatalogos: () => void
}

const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 bg-gray-50 transition placeholder:text-gray-400"

function hexSoftBg(hex: string) {
  if (!hex || hex.length < 7) return '#f3f4f6'
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},0.12)`
}

export default function TabInfoBase({ form, set, series, onRefreshCatalogos }: Props) {
  const [nuevaSerie,     setNuevaSerie]     = useState('')
  const [nuevaVertical,  setNuevaVertical]  = useState('')
  const [nuevaCategoria, setNuevaCategoria] = useState('')
  const [addingSerie,    setAddingSerie]    = useState(false)
  const [addingVertical, setAddingVertical] = useState(false)
  const [addingCat,      setAddingCat]      = useState(false)

  const RENOVACIONES = ['Automatica', 'Manual']
  const VIGENCIAS    = [
    { label: '30 días',  value: 30  },
    { label: '60 días',  value: 60  },
    { label: '90 días',  value: 90  },
    { label: '180 días', value: 180 },
    { label: '365 días', value: 365 },
  ]


  const toggleCategoria = (id: string) => {
    const curr = form.categorias_ids || []
    set('categorias_ids', curr.includes(id) ? curr.filter((x: string) => x !== id) : [...curr, id])
  }

  const handleAgregarSerie = async () => {
    if (!nuevaSerie.trim()) return
    const COLORS = ['#6366f1','#f59e0b','#22c55e','#3b82f6','#ec4899','#8b5cf6','#14b8a6','#ef4444']
    const color  = COLORS[series.length % COLORS.length]
    await supabase.from('series_paquetes').insert({ nombre: nuevaSerie.trim(), color })
    setNuevaSerie(''); setAddingSerie(false)
    onRefreshCatalogos()
  }

  const handleAgregarVertical = async () => {
    if (!nuevaVertical.trim()) return
    const COLORS = ['#6366f1','#f59e0b','#22c55e','#3b82f6','#ec4899','#8b5cf6']
    const color  = COLORS[Math.floor(Math.random() * COLORS.length)]
    await supabase.from('verticales').insert({ nombre: nuevaVertical.trim(), color })
    setNuevaVertical(''); setAddingVertical(false)
    onRefreshCatalogos()
  }

  const handleAgregarCategoria = async () => {
    if (!nuevaCategoria.trim()) return
    const verticalId = form.verticales_ids?.[0] || null
    await supabase.from('categorias_clase').insert({ nombre: nuevaCategoria.trim(), vertical_id: verticalId })
    setNuevaCategoria(''); setAddingCat(false)
    onRefreshCatalogos()
  }
  
  const bioRef = useCallback((el: HTMLTextAreaElement | null) => {
  if (el) {
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }
}, [form.bio])

  return (
    <div className="px-6 py-5 space-y-6">

      {/* Serie del paquete */}
      <div className="space-y-2">
        <p className="text-sm font-bold text-gray-800">
          Serie del paquete* <span className="text-xs text-gray-400 font-normal">(define que configuración aplica)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {series.map(s => (
            <button key={s.id} onClick={() => {
    set('serie_id', form.serie_id === s.id ? '' : s.id)
  }}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border transition"
              style={form.serie_id === s.id
                ? { backgroundColor: s.color, color: '#fff', borderColor: s.color }
                : { backgroundColor: hexSoftBg(s.color), color: s.color, borderColor: 'transparent' }
              }>
              {form.serie_id === s.id && '✓ '}{s.nombre}
            </button>
          ))}
          {addingSerie ? (
            <div className="flex items-center gap-1">
              <input autoFocus value={nuevaSerie} onChange={e => setNuevaSerie(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAgregarSerie(); if (e.key === 'Escape') setAddingSerie(false) }}
                placeholder="Nueva serie" className="border border-gray-200 rounded-xl px-3 py-1 text-xs outline-none focus:border-gray-400 w-28" />
              <button onClick={handleAgregarSerie} className="text-xs font-bold text-emerald-500 hover:text-emerald-700">✓</button>
              <button onClick={() => setAddingSerie(false)} className="text-xs text-gray-400 hover:text-gray-600"><X size={12}/></button>
            </div>
          ) : (
            <button onClick={() => setAddingSerie(true)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition flex items-center gap-1">
              <Plus size={11}/> Nueva serie
            </button>
          )}
        </div>
      </div>

      {/* Nombre + Código */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Nombre del paquete*</label>
          <input placeholder="Nombre" className={inputCls}
            value={form.nombre} onChange={e => set('nombre', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">
            Código interno <span className="text-gray-400 text-xs">(Opcional)</span>
          </label>
          <input placeholder="Ej. UNL-GG-001" className={inputCls}
            value={form.codigo_interno} onChange={e => set('codigo_interno', e.target.value)} />
        </div>
      </div>

      {/* Bio */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">
          Bio <span className="text-gray-400 text-xs">(Visible en la app y en terminal)</span>
        </label>
        <textarea
          ref={bioRef}
          placeholder="Breve descripción del paquete"
          className={`${inputCls} resize-none overflow-hidden`}
          value={form.bio}
          rows={2}
          onChange={e => {
            set('bio', e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
          }}
        />
      </div>

      {/* Vigencia + Clases + Renovación */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Vigencia*</label>
            <div className="flex items-center gap-2">
                <input type="number" min={1} max={365}
                className={inputCls}
                value={form.vigencia_dias}
                onChange={e => set('vigencia_dias', Math.min(365, Math.max(1, Number(e.target.value))))} />
                <span className="text-sm text-gray-500 whitespace-nowrap">días</span>
            </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Clases incluidas*</label>
          <select className={`${inputCls} appearance-none cursor-pointer`}
            value={form.clases_incluidas || ''} 
            onChange={e => set('clases_incluidas', e.target.value === 'ilimitado' ? null : Number(e.target.value))}>
            <option value="ilimitado">Ilimitado</option>
            {Array.from({ length: 30 }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>{n} {n === 1 ? 'clase' : 'clases'}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Renovación*</label>
          <select className={`${inputCls} appearance-none cursor-pointer`}
            value={form.renovacion} onChange={e => set('renovacion', e.target.value)}>
            {RENOVACIONES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* Visibilidad en app */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div>
          <p className="text-sm font-bold text-gray-800">Visible en app</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Si está desactivado, este paquete no aparecerá en la app para nuevas compras
          </p>
        </div>
        <button
          onClick={() => set('visible_en_app', !form.visible_en_app)}
          className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
            form.visible_en_app !== false ? 'bg-emerald-500' : 'bg-gray-200'
          }`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
            form.visible_en_app !== false ? 'translate-x-6' : 'translate-x-0'
          }`} />
        </button>
      </div>

      {/* Máximo de usuarios */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-800">Usuarios por membresía</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Define cuántos usuarios pueden usar este paquete
          </p>
        </div>
        <div className="px-4 py-4 flex gap-3">
          {[1, 2].map(n => (
            <button key={n} type="button"
              onClick={() => set('max_usuarios', n)}
              className={`flex-1 flex flex-col items-center gap-1.5 py-4 rounded-xl border-2 transition ${
                form.max_usuarios === n
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}>
              <span className="text-2xl">{n === 1 ? '👤' : '👥'}</span>
              <span className="text-sm font-bold">{n === 1 ? '1 usuario' : '2 usuarios'}</span>
              <span className={`text-xs ${form.max_usuarios === n ? 'text-gray-300' : 'text-gray-400'}`}>
                {n === 1 ? 'Membresía individual' : 'Titular + invitado'}
              </span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Penalización No Show */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-800">Penalización No Show</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Cobro automático al cliente si no se presenta a su clase reservada
            </p>
          </div>
          <button
            onClick={() => set('penalizacion_noshow', !form.penalizacion_noshow)}
            className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
              form.penalizacion_noshow ? 'bg-emerald-500' : 'bg-gray-200'
            }`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
              form.penalizacion_noshow ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {form.penalizacion_noshow && (
          <div className="px-4 py-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Monto de penalización</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  placeholder="150"
                  className={`${inputCls} pl-6`}
                  value={form.monto_penalizacion || ''}
                  onChange={e => set('monto_penalizacion', Number(e.target.value))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">MXN</span>
              </div>
              <p className="text-xs text-gray-400">
                El cobro se realiza automáticamente con OrkestaPay al detectar el No Show
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}