'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  sucursal?: any // si viene, es edición
}

export default function ModalCrearSucursal({ isOpen, onClose, onSuccess, sucursal }: Props) {
  const editando = !!sucursal
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    nombre:    sucursal?.nombre    || '',
    ciudad:    sucursal?.ciudad    || '',
    direccion: sucursal?.direccion || '',
    gerente:   sucursal?.gerente   || '',
    telefono:  sucursal?.telefono  || '',
    email:     sucursal?.email     || '',
    capacidad: sucursal?.capacidad || 100,
    estatus: sucursal?.estatus || 'Activa',
    color: sucursal?.color || '',
  })

  const set = (field: string, value: any) =>
    setFormData(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const PALETTE = ['#6366f1','#f97316','#22c55e','#3b82f6','#ec4899','#8b5cf6','#14b8a6','#f59e0b']
    const hash = formData.nombre.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0)
    const colorAuto = PALETTE[hash % PALETTE.length]
    
    const payload = {
      nombre:    formData.nombre,
      ciudad:    formData.ciudad,
      direccion: formData.direccion,
      gerente:   formData.gerente,
      telefono:  formData.telefono,
      email:     formData.email,
      capacidad: Number(formData.capacidad),
      estatus: formData.estatus,
      color: formData.color || colorAuto,
    }

    const { error } = editando
      ? await supabase.from('sucursales').update(payload).eq('id', sucursal.id)
      : await supabase.from('sucursales').insert([payload])

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl">

        <div className="flex justify-between items-center p-6 border-b border-zinc-100">
          <h2 className="text-lg font-black text-zinc-900">{editando ? 'Editar Sucursal' : 'Nueva Sucursal'}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-900 transition"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Nombre</label>
              <input required placeholder="Juriquilla"
                className="w-full border border-zinc-200 rounded-xl p-3 text-sm text-zinc-900 outline-none focus:border-indigo-500 transition"
                value={formData.nombre} onChange={e => set('nombre', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Ciudad</label>
              <input required placeholder="QRO"
                className="w-full border border-zinc-200 rounded-xl p-3 text-sm text-zinc-900 outline-none focus:border-indigo-500 transition"
                value={formData.ciudad} onChange={e => set('ciudad', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase">Dirección</label>
            <input placeholder="Av. Ejemplo 1234"
              className="w-full border border-zinc-200 rounded-xl p-3 text-sm text-zinc-900 outline-none focus:border-indigo-500 transition"
              value={formData.direccion} onChange={e => set('direccion', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Gerente</label>
              <input placeholder="Nombre del gerente"
                className="w-full border border-zinc-200 rounded-xl p-3 text-sm text-zinc-900 outline-none focus:border-indigo-500 transition"
                value={formData.gerente} onChange={e => set('gerente', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Capacidad</label>
              <input type="number" min={1}
                className="w-full border border-zinc-200 rounded-xl p-3 text-sm text-zinc-900 outline-none focus:border-indigo-500 transition"
                value={formData.capacidad} onChange={e => set('capacidad', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Teléfono</label>
              <input placeholder="55 1234 5678"
                className="w-full border border-zinc-200 rounded-xl p-3 text-sm text-zinc-900 outline-none focus:border-indigo-500 transition"
                value={formData.telefono} onChange={e => set('telefono', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Estatus</label>
              <select className="w-full border border-zinc-200 rounded-xl p-3 text-sm text-zinc-900 outline-none appearance-none"
                value={formData.estatus} onChange={e => set('estatus', e.target.value)}>
                <option value="Activa">Activa</option>
                <option value="Inactiva">Inactiva</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-zinc-200 text-zinc-500 py-3 rounded-xl font-bold text-sm hover:bg-zinc-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-indigo-600 text-white font-black py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 text-sm transition">
              {loading ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear Sucursal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}