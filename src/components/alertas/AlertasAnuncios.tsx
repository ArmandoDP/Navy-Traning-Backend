'use client'
import { useEffect, useState } from 'react'
import { supabase }            from '@/lib/supabase'
import { Send, RefreshCw, Megaphone, Globe, MapPin } from 'lucide-react'

export default function AlertasAnuncios() {
  const [sucursales,  setSucursales]  = useState<any[]>([])
  const [anuncios,    setAnuncios]    = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [enviando,    setEnviando]    = useState(false)
  const [form,        setForm]        = useState({
    titulo:      '',
    cuerpo:      '',
    scope:       'global',
    sucursal_id: '',
    canales:     ['push'] as string[],
  })
  const [toast, setToast] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('sucursales').select('id, nombre, color').eq('estatus', 'Activa').order('nombre'),
      supabase.from('anuncios').select('*').order('created_at', { ascending: false }).limit(10),
    ]).then(([{ data: sucs }, { data: anns }]) => {
      if (sucs) setSucursales(sucs)
      if (anns) setAnuncios(anns)
      setLoading(false)
    })
  }, [])

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const toggleCanal = (canal: string) => {
    setForm(p => ({
      ...p,
      canales: p.canales.includes(canal)
        ? p.canales.filter(c => c !== canal)
        : [...p.canales, canal]
    }))
  }

  const handleEnviar = async () => {
    if (!form.titulo.trim() || !form.cuerpo.trim()) return
    if (form.canales.length === 0) return

    setEnviando(true)

    // 1. Guardar en anuncios
    const { data: anuncio } = await supabase.from('anuncios').insert({
      titulo:      form.titulo,
      cuerpo:      form.cuerpo,
      scope:       form.scope,
      sucursal_id: form.scope === 'sucursal' ? form.sucursal_id : null,
      canales:     form.canales,
    }).select().single()

    // 2. Guardar en actividad_log para feed de Novedades
    await supabase.from('actividad_log').insert({
      tipo:        'anuncio',
      descripcion: `${form.titulo} — ${form.cuerpo}`,
      sucursal_id: form.scope === 'sucursal' ? form.sucursal_id : null,
    })

    // 3. Si incluye push — llamar al endpoint
    if (form.canales.includes('push')) {
      await fetch('/api/notificaciones/anuncio', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          titulo:      form.titulo,
          cuerpo:      form.cuerpo,
          scope:       form.scope,
          sucursal_id: form.scope === 'sucursal' ? form.sucursal_id : null,
        }),
      })
    }

    setAnuncios(prev => [anuncio, ...prev])
    setForm({ titulo: '', cuerpo: '', scope: 'global', sucursal_id: '', canales: ['push'] })
    setToast('Anuncio enviado correctamente')
    setTimeout(() => setToast(''), 3000)
    setEnviando(false)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

      {/* Formulario */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Megaphone size={16} className="text-gray-500" />
          <p className="text-sm font-black text-gray-900">Nuevo anuncio</p>
        </div>

        {/* Título */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-600">Título</label>
          <input
            type="text"
            value={form.titulo}
            onChange={e => set('titulo', e.target.value)}
            placeholder="Ej: Nuevo coach en Navy — ¡Conócelo!"
            maxLength={60}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400 bg-gray-50"
          />
          <p className="text-[10px] text-gray-400 text-right">{form.titulo.length}/60</p>
        </div>

        {/* Mensaje */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-600">Mensaje</label>
          <textarea
            value={form.cuerpo}
            onChange={e => set('cuerpo', e.target.value)}
            placeholder="Escribe el mensaje que recibirán los clientes..."
            rows={3}
            maxLength={200}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400 bg-gray-50 resize-none"
          />
          <p className="text-[10px] text-gray-400 text-right">{form.cuerpo.length}/200</p>
        </div>

        {/* Alcance */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-600">Alcance</label>
          <div className="flex gap-2">
            <button
              onClick={() => set('scope', 'global')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition ${
                form.scope === 'global' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'
              }`}>
              <Globe size={12}/> Global
            </button>
            <button
              onClick={() => set('scope', 'sucursal')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition ${
                form.scope === 'sucursal' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'
              }`}>
              <MapPin size={12}/> Sucursal
            </button>
          </div>
          {form.scope === 'sucursal' && (
            <select
              value={form.sucursal_id}
              onChange={e => set('sucursal_id', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400 bg-gray-50">
              <option value="">Seleccionar sucursal</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          )}
        </div>

        {/* Canales */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-600">Canales</label>
          <div className="flex gap-2">
            {[
              { key: 'push',     label: '📱 Push'    },
              { key: 'correo',   label: '✉️ Correo'  },
              { key: 'novedades',label: '📰 Novedades'},
            ].map(c => (
              <button key={c.key}
                onClick={() => toggleCanal(c.key)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition ${
                  form.canales.includes(c.key) ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'
                }`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        {form.titulo && form.cuerpo && (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Vista previa push</p>
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-900">🏋️ Navy Training — {form.titulo}</p>
              <p className="text-xs text-gray-500 mt-0.5">{form.cuerpo}</p>
            </div>
          </div>
        )}

        <button
          onClick={handleEnviar}
          disabled={!form.titulo.trim() || !form.cuerpo.trim() || form.canales.length === 0 || enviando || (form.scope === 'sucursal' && !form.sucursal_id)}
          className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-700 transition disabled:opacity-40">
          {enviando ? <RefreshCw size={14} className="animate-spin"/> : <Send size={14}/>}
          {enviando ? 'Enviando...' : 'Enviar anuncio'}
        </button>

        {toast && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-xs font-bold text-emerald-700 text-center">
            ✓ {toast}
          </div>
        )}
      </div>

      {/* Historial */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-black text-gray-900">Anuncios recientes</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 gap-2 text-sm">
            <RefreshCw size={14} className="animate-spin"/> Cargando...
          </div>
        ) : anuncios.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm italic">
            Aún no hay anuncios enviados
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {anuncios.map(a => (
              <div key={a.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">{a.titulo}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.cuerpo}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        a.scope === 'global' ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'
                      }`}>
                        {a.scope === 'global' ? '🌐 Global' : '📍 Sucursal'}
                      </span>
                      {a.canales?.map((c: string) => (
                        <span key={c} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-300 whitespace-nowrap">
                    {new Date(a.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}