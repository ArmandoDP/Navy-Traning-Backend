'use client'
import { AlertTriangle } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  titulo: string
  mensaje: string
  loading?: boolean
}

export default function ModalConfirmar({ isOpen, onClose, onConfirm, titulo, mensaje, loading }: Props) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center">
        <div className="bg-red-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="text-red-500" size={32} />
        </div>
        
        <h2 className="text-xl font-bold text-white mb-2">{titulo}</h2>
        <p className="text-zinc-400 text-sm mb-6">{mensaje}</p>

        <div className="flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-zinc-800 rounded-xl text-zinc-400 hover:bg-zinc-800 transition"
          >
            Cancelar
          </button>
          <button 
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Borrando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}