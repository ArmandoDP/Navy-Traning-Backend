'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { X } from 'lucide-react'

interface ModalEditarProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  cliente: any // El socio que seleccionamos para editar
}

export default function ModalEditar({ isOpen, onClose, onSuccess, cliente }: ModalEditarProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    nombre_completo: '',
    email: '',
    plan: '',
    estatus: ''
  })

  // Sincronizar el formulario con el cliente seleccionado cuando abra el modal
  useEffect(() => {
    if (cliente) {
      setFormData({
        nombre_completo: cliente.nombre_completo || '',
        email: cliente.email || '',
        plan: cliente.plan || '',
        estatus: cliente.estatus || 'Activo'
      })
    }
  }, [cliente])

  if (!isOpen || !cliente) return null

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase
      .from('clientes')
      .update({
        nombre_completo: formData.nombre_completo,
        email: formData.email,
        plan: formData.plan,
        estatus: formData.estatus
      })
      .eq('id', cliente.id) // Solo actualizamos al socio con este ID

    if (error) {
      alert("Error al actualizar: " + error.message)
    } else {
      onSuccess() // Refrescar la tabla en el padre
      onClose()
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl p-8 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black italic uppercase tracking-tighter text-white">Editar Socio Navy</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white transition"><X size={20}/></button>
        </div>

        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase">Nombre</label>
            <input
              className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none focus:border-white transition"
              value={formData.nombre_completo}
              onChange={(e) => setFormData({...formData, nombre_completo: e.target.value})}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase">Email</label>
            <input 
              type="email"
              className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none focus:border-white transition"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">Plan</label>
              <select 
                className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none"
                value={formData.plan}
                onChange={(e) => setFormData({...formData, plan: e.target.value})}
              >
                <option value="Mensual">Mensual</option>
                <option value="Trimestral">Trimestral</option>
                <option value="Anual">Anual</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">Estatus</label>
              <select
                className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white outline-none"
                value={formData.estatus}
                onChange={(e) => setFormData({...formData, estatus: e.target.value})}
              >
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
                <option value="Vencido">Vencido</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button 
              type="submit" disabled={loading}
              className="flex-1 bg-white text-black font-black py-4 rounded-xl hover:bg-zinc-200 disabled:opacity-50 uppercase text-sm"
            >
              {loading ? 'Guardando...' : 'Actualizar Datos'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}