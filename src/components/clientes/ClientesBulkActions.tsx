'use client'
import { Package, RefreshCw, UserX } from 'lucide-react'

interface Props {
  cantidad:          number
  onCambiarPaquete:  () => void
  onRenovar:         () => void
  onMarcarPerdido:   () => void
}

export default function ClientesBulkActions({ cantidad, onCambiarPaquete, onRenovar, onMarcarPerdido }: Props) {
  if (cantidad === 0) return null

  const btn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-700 hover:bg-gray-100 bg-white transition'

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-indigo-600 font-bold">{cantidad} seleccionados</span>
      <button onClick={onCambiarPaquete} className={btn}>
        <Package size={12}/> Cambiar paquete
      </button>
      <button onClick={onRenovar} className={btn}>
        <RefreshCw size={12}/> Renovar
      </button>
      <button onClick={onMarcarPerdido} className={`${btn} hover:bg-red-50 hover:text-red-600 hover:border-red-200`}>
        <UserX size={12}/> Marcar como perdido
      </button>
    </div>
  )
}