'use client'
import { useState } from 'react'
import { Mail, Phone, MessageCircle } from 'lucide-react'
import ToastExito from '@/components/ToastExito'

interface Comunicacion {
  id: string; tipo: string; asunto?: string; estado: string
  origen: string; created_at: string
}

interface Props {
  cliente:          any
  comunicaciones:   Comunicacion[]
}

type Canal = 'Email' | 'SMS' | 'WhatsApp'

const PLANTILLAS = ['Recordatorio', 'Promo Upgrade', 'Win-back', 'Cumpleaños']

const ESTADO_COLORS: Record<string, string> = {
  'Abierto':    'text-green-600 bg-green-50',
  'Entregado':  'text-blue-600  bg-blue-50',
  'Click':      'text-gray-700  bg-gray-100',
  'Respondió':  'text-green-600 bg-green-50',
  'Enviado':    'text-gray-500  bg-gray-100',
}

const TIPO_ICON: Record<string, React.ReactNode> = {
  email:    <Mail size={14} className="text-gray-400"/>,
  sms:      <Phone size={14} className="text-gray-400"/>,
  whatsapp: <MessageCircle size={14} className="text-gray-400"/>,
}

export default function TabComunicaciones({ cliente, comunicaciones }: Props) {
  const [canal,  setCanal]  = useState<Canal>('Email')
  const [toast,  setToast]  = useState(false)

  const sorted = [...comunicaciones].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div className="space-y-4">
      {toast && (
        <ToastExito
          titulo="Próximamente"
          mensaje="El envío de mensajes estará disponible cuando se integre Twilio y el servicio de email."
          onClose={() => setToast(false)}
          duracion={3000}
        />
      )}

      {/* Enviar mensaje */}
      <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-gray-500">Enviar Mensaje</p>

        {/* Canales */}
        <div className="grid grid-cols-3 gap-2">
          {(['Email','SMS','WhatsApp'] as Canal[]).map(c => (
            <button key={c} onClick={() => setCanal(c)}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border-2 transition ${
                canal === c ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-400'
              }`}>
              {c === 'Email' && <Mail size={14}/>}
              {c === 'SMS'   && <Phone size={14}/>}
              {c === 'WhatsApp' && <MessageCircle size={14}/>}
              {c}
            </button>
          ))}
        </div>

        {/* Plantillas */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-400 font-medium">Plantillas</span>
          {PLANTILLAS.map(p => (
            <button key={p} onClick={() => setToast(true)}
              className="px-2.5 py-1 border border-gray-200 rounded-full text-[11px] font-medium text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition">
              {p}
            </button>
          ))}
        </div>

        <button onClick={() => setToast(true)}
          className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition"
          style={{ backgroundColor: '#171B24' }}>
          Enviar {canal} →
        </button>
      </div>

      {/* Historial */}
      <div className="space-y-1">
        {sorted.length === 0 ? (
          <p className="text-xs text-gray-400 italic text-center py-6">Sin comunicaciones registradas</p>
        ) : sorted.map(c => (
          <div key={c.id} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
            <div className="flex-shrink-0">
              {TIPO_ICON[c.tipo] || <Mail size={14} className="text-gray-400"/>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{c.asunto || 'Mensaje'}</p>
              <p className="text-[11px] text-gray-400">
                {new Date(c.created_at).toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' })}
                {' · '}{new Date(c.created_at).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })}
                {' · '}{c.origen}
              </p>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0 ${ESTADO_COLORS[c.estado] || 'bg-gray-100 text-gray-500'}`}>
              {c.estado}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}