'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Plus, Trash2 } from 'lucide-react'

interface Props {
  producto:   any | null
  sucursalId: string | null
  isOpen:     boolean
  onClose:    () => void
  onSuccess:  () => void
}

const CATEGORIAS  = ['Smoothie', 'Alimento', 'Bebida', 'Snack', 'Suplemento']
const SUCURSALES_NAMES: Record<string, string> = {
  'f8f798a8-d89b-4874-a53a-cdcb6325ad2a': 'Condesa',
  '74ca16d9-3ac6-4a7b-ad91-149004bcda64': 'Interlomas Gym',
  '7e8352fe-2641-4474-a9eb-eb555f710f0b': 'Interlomas Studio',
  '249f4814-95fd-4d3b-919f-57e21e737910': 'Juriquilla',
  '00859e09-0c9d-4690-9265-9fe4a12d0492': 'Lomas',
  '800f4d25-1e08-4310-9359-24c5ccfbf4ec': 'Refugio',
}

export default function DrawerProducto({ producto, sucursalId, isOpen, onClose, onSuccess }: Props) {
  const esNuevo = !producto

  const [nombre,      setNombre]      = useState(producto?.nombre || '')
  const [categoria,   setCategoria]   = useState(producto?.categoria || 'Smoothie')
  const [tipo,        setTipo]        = useState<'simple' | 'con_receta'>(producto?.tipo || 'con_receta')
  const [descripcion, setDescripcion] = useState(producto?.descripcion || '')
  const [activo,      setActivo]      = useState(producto?.activo ?? true)
  const [precios,     setPrecios]     = useState<Record<string, string>>({})
  const [costos,      setCostos]      = useState<Record<string, string>>({})
  const [receta,      setReceta]      = useState<any[]>([])
  const [insumos,     setInsumos]     = useState<any[]>([])
  const [sucursales,  setSucursales]  = useState<any[]>([])
  const [guardando,   setGuardando]   = useState(false)
  const [activeTab,   setActiveTab]   = useState<'info' | 'receta' | 'precios'>('info')

  useEffect(() => {
    if (!isOpen) return
    fetchInsumos()
    fetchSucursales()
    if (producto) {
      // Cargar precios existentes
      const p: Record<string, string> = {}
      const c: Record<string, string> = {}
      producto.producto_precios?.forEach((pp: any) => {
        p[pp.sucursal_id] = pp.precio_venta?.toString() || ''
        c[pp.sucursal_id] = pp.costo_total?.toString() || ''
      })
      setPrecios(p)
      setCostos(c)
      // Cargar receta existente
      setReceta(producto.receta_ingredientes?.map((ri: any) => ({
        insumo_id: ri.insumo_id,
        cantidad:  ri.cantidad?.toString(),
        unidad:    ri.unidad,
        es_opcional: ri.es_opcional || false,
        nombre:    ri.insumos?.nombre,
      })) || [])
    }
  }, [isOpen, producto])

  const fetchInsumos = async () => {
    const { data } = await supabase.from('insumos').select('id, nombre, unidad, categoria').order('nombre')
    setInsumos(data || [])
  }

  const fetchSucursales = async () => {
    const { data } = await supabase.from('sucursales').select('id, nombre').eq('estatus', 'Activa').order('nombre')
    setSucursales(data || [])
  }

  const agregarIngrediente = () => {
    setReceta(prev => [...prev, { insumo_id: '', cantidad: '', unidad: 'g', es_opcional: false, nombre: '' }])
  }

  const actualizarIngrediente = (idx: number, campo: string, valor: any) => {
    setReceta(prev => prev.map((r, i) => {
      if (i !== idx) return r
      if (campo === 'insumo_id') {
        const ins = insumos.find(ins => ins.id === valor)
        return { ...r, insumo_id: valor, nombre: ins?.nombre || '', unidad: ins?.unidad || 'g' }
      }
      return { ...r, [campo]: valor }
    }))
  }

  const handleGuardar = async () => {
    if (!nombre || !categoria) return
    setGuardando(true)

    if (esNuevo) {
      // Crear producto
      const { data: prod } = await supabase.from('productos').insert({
        nombre, categoria, tipo, descripcion, activo
      }).select().single()

      if (!prod) { setGuardando(false); return }

      // Insertar receta
      if (tipo === 'con_receta' && receta.length > 0) {
        await supabase.from('receta_ingredientes').insert(
          receta.filter(r => r.insumo_id && r.cantidad).map(r => ({
            producto_id: prod.id,
            insumo_id:   r.insumo_id,
            cantidad:    parseFloat(r.cantidad),
            unidad:      r.unidad,
            es_opcional: r.es_opcional,
          }))
        )
      }

      // Insertar precios
      const preciosInsert = sucursales
        .filter(s => precios[s.id])
        .map(s => ({
          producto_id:  prod.id,
          sucursal_id:  s.id,
          precio_venta: parseFloat(precios[s.id]),
          costo_total:  parseFloat(costos[s.id] || '0'),
          activo:       true,
        }))
      if (preciosInsert.length > 0) await supabase.from('producto_precios').insert(preciosInsert)

    } else {
      // Actualizar producto
      await supabase.from('productos').update({ nombre, categoria, tipo, descripcion, activo }).eq('id', producto.id)

      // Actualizar receta — borrar y reinsertar
      if (tipo === 'con_receta') {
        await supabase.from('receta_ingredientes').delete().eq('producto_id', producto.id)
        if (receta.length > 0) {
          await supabase.from('receta_ingredientes').insert(
            receta.filter(r => r.insumo_id && r.cantidad).map(r => ({
              producto_id: producto.id,
              insumo_id:   r.insumo_id,
              cantidad:    parseFloat(r.cantidad),
              unidad:      r.unidad,
              es_opcional: r.es_opcional,
            }))
          )
        }
      }

      // Actualizar precios — upsert
      for (const s of sucursales) {
        if (!precios[s.id]) continue
        await supabase.from('producto_precios').upsert({
          producto_id:  producto.id,
          sucursal_id:  s.id,
          precio_venta: parseFloat(precios[s.id]),
          costo_total:  parseFloat(costos[s.id] || '0'),
          activo:       true,
        }, { onConflict: 'producto_id,sucursal_id' })
      }
    }

    setGuardando(false)
    onSuccess()
  }

  if (!isOpen) return null

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
      <div className="fixed top-0 right-0 z-50 h-full bg-white shadow-2xl flex flex-col" style={{ width: '560px' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-black text-gray-900">
              {esNuevo ? 'Nuevo producto' : `Editar · ${producto.nombre}`}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{esNuevo ? 'THE GALLEY Smoothie Bar' : producto.categoria}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {[
            { key: 'info',    label: '📋 Info' },
            { key: 'receta',  label: '🧪 Receta', show: tipo === 'con_receta' },
            { key: 'precios', label: '💰 Precios' },
          ].filter(t => t.show !== false).map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              className={`flex-1 py-3 text-xs font-bold border-b-2 transition ${
                activeTab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {activeTab === 'info' && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Nombre</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400"
                  value={nombre} onChange={e => setNombre(e.target.value)}
                  placeholder="Nombre del producto"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Categoría</label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400 bg-white"
                    value={categoria} onChange={e => setCategoria(e.target.value)}>
                    {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Tipo</label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400 bg-white"
                    value={tipo} onChange={e => setTipo(e.target.value as any)}>
                    <option value="con_receta">Con receta</option>
                    <option value="simple">Simple</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Descripción</label>
                <textarea
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400 resize-none"
                  rows={3} value={descripcion} onChange={e => setDescripcion(e.target.value)}
                  placeholder="Descripción del producto"
                />
              </div>

              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-gray-900">Producto activo</p>
                  <p className="text-xs text-gray-400">Aparece en el punto de venta</p>
                </div>
                <button onClick={() => setActivo((p: boolean) => !p)}
                  className={`w-10 h-6 rounded-full transition-colors relative ${activo ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${activo ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </>
          )}

          {activeTab === 'receta' && tipo === 'con_receta' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-gray-900">{receta.length} ingredientes</p>
                <button onClick={agregarIngrediente}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                  <Plus size={12} /> Agregar
                </button>
              </div>

              <div className="space-y-3">
                {receta.map((r, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-gray-500">Ingrediente {idx + 1}</p>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                          <input type="checkbox" checked={r.es_opcional}
                            onChange={e => actualizarIngrediente(idx, 'es_opcional', e.target.checked)}
                            className="rounded" />
                          Opcional
                        </label>
                        <button onClick={() => setReceta(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1 hover:bg-red-50 rounded text-red-400">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 bg-white"
                      value={r.insumo_id}
                      onChange={e => actualizarIngrediente(idx, 'insumo_id', e.target.value)}>
                      <option value="">Seleccionar insumo...</option>
                      {insumos.map(ins => (
                        <option key={ins.id} value={ins.id}>{ins.nombre} ({ins.unidad})</option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number" placeholder="Cantidad" min="0"
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
                        value={r.cantidad}
                        onChange={e => actualizarIngrediente(idx, 'cantidad', e.target.value)}
                      />
                      <input
                        placeholder="Unidad"
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
                        value={r.unidad}
                        onChange={e => actualizarIngrediente(idx, 'unidad', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
                {receta.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm italic">
                    Sin ingredientes — agrega uno
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'precios' && (
            <div className="space-y-3">
              {sucursales.map(s => (
                <div key={s.id} className="border border-gray-200 rounded-xl p-4">
                  <p className="text-sm font-black text-gray-900 mb-3">{s.nombre}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400">Precio venta</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          type="number" min="0" placeholder="0"
                          className="w-full pl-7 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
                          value={precios[s.id] || ''}
                          onChange={e => setPrecios(prev => ({ ...prev, [s.id]: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400">Costo total</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          type="number" min="0" placeholder="0"
                          className="w-full pl-7 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
                          value={costos[s.id] || ''}
                          onChange={e => setCostos(prev => ({ ...prev, [s.id]: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  {precios[s.id] && costos[s.id] && (
                    <p className="text-xs text-gray-400 mt-2">
                      Margen: {(((parseFloat(precios[s.id]) - parseFloat(costos[s.id])) / parseFloat(precios[s.id])) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={handleGuardar}
            disabled={!nombre || guardando}
            className="w-full py-3 rounded-xl text-sm font-black text-white disabled:opacity-40 transition"
            style={{ backgroundColor: '#171B24' }}>
            {guardando ? 'Guardando...' : esNuevo ? 'Crear producto' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </>
  )
}