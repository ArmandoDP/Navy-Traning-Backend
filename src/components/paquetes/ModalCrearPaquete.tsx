'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  paquete?: any // si viene, es edición
}

export default function ModalCrearPaquete({ isOpen, onClose, onSuccess, paquete }: Props) {
  const editando = !!paquete
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    nombre:        paquete?.nombre        || '',
    precio:        paquete?.precio        || '',
    duracion:      paquete?.duracion      || 30,
    numero_clases: paquete?.numero_clases || '',
    descripcion:   paquete?.descripcion   || '',
    reglas_pagos:  paquete?.reglas_pagos  || '',
    cancelaciones: paquete?.cancelaciones || 0,
    no_shows:      paquete?.no_shows      || 0,
    add_ons:       paquete?.add_ons       || '',
    estatus:       paquete?.estatus       || 'Activo',
  })

  const set = (field: string, value: any) =>
    setFormData(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const payload = {
      nombre:        formData.nombre,
      precio:        Number(formData.precio),
      duracion:      Number(formData.duracion),
      numero_clases: formData.numero_clases !== '' ? Number(formData.numero_clases) : null,
      descripcion:   formData.descripcion,
      reglas_pagos:  formData.reglas_pagos,
      cancelaciones: Number(formData.cancelaciones),
      no_shows:      Number(formData.no_shows),
      add_ons:       formData.add_ons,
      estatus:       formData.estatus,
    }

    const { error } = editando
      ? await supabase.from('paquetes').update(payload).eq('id', paquete.id)
      : await supabase.from('paquetes').insert([payload])

    if (error) {
      alert('Error: ' + error.message)
    } else {
      onSuccess()
      onClose()
    }
    setLoading(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]">

        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
          <h2 className="text-xl font-black italic uppercase tracking-tighter">
            {editando ? 'Editar Paquete' : 'Nuevo Paquete'}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Nombre + Estatus */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">Nombre del Paquete</label>
              <input
                required
                placeholder="Ej: Mensual Premium"
                className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none focus:border-white transition"
                value={formData.nombre}
                onChange={e => set('nombre', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">Estatus</label>
              <select
                className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none appearance-none"
                value={formData.estatus}
                onChange={e => set('estatus', e.target.value)}
              >
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>
          </div>

          {/* Precio + Duración + Clases */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">Precio (MXN)</label>
              <input
                required type="number" min={0}
                placeholder="1200"
                className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none focus:border-white transition"
                value={formData.precio}
                onChange={e => set('precio', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">Duración (días)</label>
              <input
                required type="number" min={1}
                className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none focus:border-white transition"
                value={formData.duracion}
                onChange={e => set('duracion', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">N° Clases</label>
              <input
                type="number" min={1}
                placeholder="Vacío = ilimitado"
                className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none focus:border-white transition placeholder:text-zinc-700 text-sm"
                value={formData.numero_clases}
                onChange={e => set('numero_clases', e.target.value)}
              />
            </div>
          </div>

          {/* Descripción */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase">Descripción</label>
            <textarea
              rows={2}
              placeholder="Describe qué incluye este paquete..."
              className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none focus:border-white transition resize-none"
              value={formData.descripcion}
              onChange={e => set('descripcion', e.target.value)}
            />
          </div>

          {/* Reglas / Políticas */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase">Reglas / Políticas de Pago</label>
            <textarea
              rows={2}
              placeholder="Ej: Pago mensual, no reembolsable..."
              className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none focus:border-white transition resize-none"
              value={formData.reglas_pagos}
              onChange={e => set('reglas_pagos', e.target.value)}
            />
          </div>

          {/* Cancelaciones + No-shows */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">Cancelaciones permitidas</label>
              <input
                type="number" min={0}
                className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none focus:border-white transition"
                value={formData.cancelaciones}
                onChange={e => set('cancelaciones', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">No-shows permitidos</label>
              <input
                type="number" min={0}
                className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none focus:border-white transition"
                value={formData.no_shows}
                onChange={e => set('no_shows', e.target.value)}
              />
            </div>
          </div>

          {/* Add-ons */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase">Add-ons / Beneficios extra</label>
            <input
              placeholder="Ej: Acceso a zona VIP, Toalla incluida..."
              className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none focus:border-white transition"
              value={formData.add_ons}
              onChange={e => set('add_ons', e.target.value)}
            />
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 border border-zinc-700 text-zinc-400 py-3 rounded-xl font-bold text-sm hover:bg-zinc-800 transition"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={loading}
              className="flex-1 bg-white text-black font-black py-3 rounded-xl hover:bg-zinc-200 disabled:opacity-50 uppercase text-sm transition"
            >
              {loading ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear Paquete'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}