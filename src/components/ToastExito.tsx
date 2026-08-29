'use client'
import { useEffect, useState } from 'react'
import { Info, X } from 'lucide-react'

interface Props {
  titulo:   string
  mensaje:  string
  onClose:  () => void
  onVer?:   () => void
  duracion?: number
}

export default function ToastExito({ titulo, mensaje, onClose, onVer, duracion = 5000 }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 10)
    const t2 = duracion ? setTimeout(() => { setVisible(false); setTimeout(onClose, 300) }, duracion) : null
    return () => { clearTimeout(t1); if (t2) clearTimeout(t2) }
  }, [])

  const handleClose = () => { setVisible(false); setTimeout(onClose, 300) }

  return (
    <>
      {/* Estilos del borde animado */}
      <style>{`
        @keyframes border-spin {
          0%   { --angle: 0deg;   }
          100% { --angle: 360deg; }
        }
        @property --angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        .toast-border {
          background:
            linear-gradient(white, white) padding-box,
            conic-gradient(
              from var(--angle),
              #22c55e 0%,
              #86efac 25%,
              #ffffff 50%,
              #86efac 75%,
              #22c55e 100%
            ) border-box;
          border: 2px solid transparent;
          animation: border-spin 2.5s linear infinite;
        }
      `}</style>

      <div className={`
        fixed top-5 right-5 z-[100]
        transition-all duration-300
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'}
      `}>
        <div className="toast-border bg-white rounded-2xl shadow-xl px-4 py-3.5 flex items-start gap-3 min-w-[300px] max-w-sm">
          {/* Icono */}
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Info size={15} className="text-green-600"/>
          </div>

          {/* Texto */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">{titulo}</p>
            <p className="text-xs text-gray-500 mt-0.5">{mensaje}</p>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {onVer && (
              <button onClick={() => { onVer(); handleClose() }}
                className="text-xs font-bold text-gray-700 border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-50 transition">
                Ver
              </button>
            )}
            <button onClick={handleClose}
              className="text-gray-400 hover:text-gray-700 transition p-0.5">
              <X size={14}/>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}