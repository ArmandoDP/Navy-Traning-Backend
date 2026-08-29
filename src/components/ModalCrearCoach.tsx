'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const ESPECIALIDADES = ['Spinning', 'Yoga', 'Box', 'Funcional', 'General']

export default function ModalCrearCoach({ isOpen, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    nombre_completo: '',
    email:           '',
    telefono:        '',
    especialidad:    'General',
    estatus:         'Activo',
  })

  const set = (field: string, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }))

  const resetForm = () => setFormData({
    nombre_completo: '',
    email:           '',
    telefono:        '',
    especialidad:    'General',
    estatus:         'Activo',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.from('coaches').insert([{
      nombre_completo: formData.nombre_completo,
      email:           formData.email,
      telefono:        formData.telefono,
      especialidad:    formData.especialidad,
      estatus:         formData.estatus,
    }])

    if (error) {
      alert('Error al crear coach: ' + error.message)
    } else {
      onSuccess()
      onClose()
      resetForm()
    }
    setLoading(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl">

        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-zinc-800">
          <h2 className="text-xl font-black italic uppercase tracking-tighter">Nuevo Coach</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Nombre */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase">Nombre Completo</label>
            <input
              required
              placeholder="Ej: Carlos Méndez"
              className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none focus:border-white transition"
              value={formData.nombre_completo}
              onChange={e => set('nombre_completo', e.target.value)}
            />
          </div>

          {/* Email + Teléfono */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">Email</label>
              <input
                type="email"
                placeholder="coach@navy.com"
                className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none focus:border-white transition"
                value={formData.email}
                onChange={e => set('email', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">Teléfono</label>
              <input
                placeholder="55 1234 5678"
                className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none focus:border-white transition"
                value={formData.telefono}
                onChange={e => set('telefono', e.target.value)}
              />
            </div>
          </div>

          {/* Especialidad + Estatus */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">Especialidad</label>
              <select
                className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none appearance-none"
                value={formData.especialidad}
                onChange={e => set('especialidad', e.target.value)}
              >
                {ESPECIALIDADES.map(esp => <option key={esp} value={esp}>{esp}</option>)}
              </select>
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

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-zinc-700 text-zinc-400 py-3 rounded-xl font-bold text-sm hover:bg-zinc-800 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-white text-black font-black py-3 rounded-xl hover:bg-zinc-200 disabled:opacity-50 uppercase text-sm transition"
            >
              {loading ? 'Guardando...' : 'Crear Coach'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}