'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function ModalRegistro({ isOpen, onClose, onSuccess }: ModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    plan: 'Mensual',
    objetivo: 'Bajar de peso'
  })

  if (!isOpen) return null

    const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // 1. Insertar el cliente y obtener su ID generado
    const { data: nuevoCliente, error: errorCliente } = await supabase
      .from('clientes')
      .insert([{ 
        nombre_completo: formData.nombre, 
        email: formData.email, 
        plan: formData.plan,
        estatus: 'Activo'
      }])
      .select() // Esto es CLAVE para obtener el ID recién creado
      .single()

    if (errorCliente) {
      alert("Error al crear cliente: " + errorCliente.message)
      setLoading(false)
      return
    }

    // 2. Si el cliente se creó, insertamos su primer pago automáticamente
    // Aquí definimos el monto según el plan (puedes ajustarlo)
    const montos: { [key: string]: number } = { 'Mensual': 1200, 'Trimestral': 3200, 'Anual': 10500 }
    const montoInicial = montos[formData.plan] || 0

    const { error: errorPago } = await supabase
      .from('pagos')
      .insert([{
        cliente_id: nuevoCliente.id,
        monto: montoInicial,
        metodo_pago: 'Efectivo', // Por defecto, o puedes añadir un select al modal
        fecha_pago: new Date().toISOString()
      }])

    if (errorPago) {
      console.error("Error al registrar pago inicial:", errorPago.message)
      // No bloqueamos todo, el cliente ya se creó, pero avisamos
    }

    // 3. Finalizar
    onSuccess()
    onClose()
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-xl rounded-2xl p-8 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold uppercase tracking-widest italic text-white">Alta de Socio Navy</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor='nombre' className="text-[10px] font-bold text-zinc-500 uppercase">Nombre</label>
              <input id='nombre'
                className="bg-black border border-zinc-800 p-3 rounded-lg text-white outline-none focus:border-white transition"
                value={formData.nombre} onChange={(e) => setFormData({...formData, nombre: e.target.value})} required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor='email' className="text-[10px] font-bold text-zinc-500 uppercase">Email</label>
              <input id='email' 
                type="email"
                className="bg-black border border-zinc-800 p-3 rounded-lg text-white outline-none focus:border-white transition"
                value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor='plan' className="text-[10px] font-bold text-zinc-500 uppercase">Plan de Entrenamiento</label>
            <select id='plan'
              className="bg-black border border-zinc-800 p-3 rounded-lg text-white outline-none appearance-none"
              value={formData.plan} onChange={(e) => setFormData({...formData, plan: e.target.value})}
            >
              <option value="Mensual">Mensual - $1,200</option>
              <option value="Trimestral">Trimestral - $3,200</option>
              <option value="Anual">Anual - $10,500</option>
            </select>
          </div>

          <div className="flex gap-3 mt-8">
            <button 
              type="submit" disabled={loading}
              className="flex-1 bg-white text-black font-black py-4 rounded-xl hover:bg-zinc-200 disabled:opacity-50 uppercase text-sm"
            >
              {loading ? 'Procesando...' : 'Confirmar Registro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}