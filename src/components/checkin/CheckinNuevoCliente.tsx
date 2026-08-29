'use client'
import { useEffect, useState } from 'react'
import { Star, Sparkles }      from 'lucide-react'

interface Props {
  data:        any
  onContinuar: () => void
}

export default function CheckinNuevoCliente({ data, onContinuar }: Props) {
  const [animado, setAnimado] = useState(false)
  const reserva  = data.reserva
  const nombre   = reserva.clientes?.nombre_completo || 'Cliente'
  const paquete  = reserva.clientes?.paquetes?.nombre || 'Sin paquete'
  const clase    = reserva.clases?.nombre_clase || 'Clase'
  const hora     = new Date(reserva.clases?.horario).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

  useEffect(() => {
    setTimeout(() => setAnimado(true), 100)
  }, [])

  return (
    <div className={`transition-all duration-500 ${animado ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-6 text-white text-center space-y-4">

        {/* Animación estrella */}
        <div className="flex justify-center gap-2 text-2xl animate-bounce">
          ⭐ 🎉 ⭐
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-widest text-indigo-200 mb-2">
            ¡Primer check-in en Navy!
          </p>
          <p className="text-2xl font-black">¡Bienvenido, {nombre.split(' ')[0]}!</p>
          <p className="text-indigo-200 text-sm mt-1">
            Es la primera vez que visita Navy Training Center
          </p>
        </div>

        {/* Info */}
        <div className="bg-white/10 rounded-xl p-4 text-left space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-indigo-200">Clase</span>
            <span className="font-bold">{clase} · {hora}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-indigo-200">Paquete</span>
            <span className="font-bold">{paquete}</span>
          </div>
        </div>

        {/* Alerta introducción */} 
        <div className="bg-amber-400 text-amber-900 rounded-xl px-4 py-3 text-sm font-bold flex items-center gap-2">
          <Star size={16} className="fill-amber-700 text-amber-700 flex-shrink-0" />
          Por favor realizar la introducción Navy a este nuevo miembro antes de la clase
        </div>

        <button onClick={onContinuar}
          className="w-full py-3 bg-white text-indigo-700 rounded-xl text-sm font-black hover:bg-indigo-50 transition">
          ✓ Entendido — Continuar
        </button>
      </div>
    </div>
  )
}