'use client'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  mensaje:  string
  tipo:     'error' | 'warning' | 'success'
  onClose:  () => void
  duracion?: number // ms, 0 = no auto-close
}

const ESTILOS = {
  error:   'bg-red-50 border-red-300 text-red-700',
  warning: 'bg-orange-50 border-orange-300 text-orange-700',
  success: 'bg-green-50 border-green-300 text-green-700',
}

export default function AuthToast({ mensaje, tipo, onClose, duracion = 5000 }: Props) {
  const [visible, setVisible] = useState(false)

  // Animación entrada
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  // Auto-close
  useEffect(() => {
    if (!duracion) return
    const t = setTimeout(() => { setVisible(false); setTimeout(onClose, 300) }, duracion)
    return () => clearTimeout(t)
  }, [duracion, onClose])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  return (
    <div className={`
      fixed top-6 left-1/2 -translate-x-1/2 z-50
      flex items-center gap-3
      border rounded-2xl px-5 py-3.5 shadow-lg
      text-sm font-medium
      transition-all duration-300
      max-w-md w-full
      ${ESTILOS[tipo]}
      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
    `}>
      <span className="flex-1">{mensaje}</span>
      <button onClick={handleClose} className="flex-shrink-0 opacity-60 hover:opacity-100 transition">
        <X size={15}/>
      </button>
    </div>
  )
}