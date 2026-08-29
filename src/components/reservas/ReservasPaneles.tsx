'use client'
import { Pencil, Send, Upload, Eye, Zap } from 'lucide-react'

const POLITICAS = [
  { color: 'bg-green-500',  texto: 'Cancelación con +24h: Sin cargo'      },
  { color: 'bg-red-500',    texto: 'Cancelación con -24h: Cargo del 50%'  },
  { color: 'bg-red-500',    texto: 'No-Show: Cargo completo'               },
]

const ALERTAS = [
  { color: 'bg-blue-400',   texto: 'Recordatorio 2h antes de clase'  },
  { color: 'bg-yellow-400', texto: 'Confirmación de asistencia'       },
  { color: 'bg-red-400',    texto: 'Notificación de cancelación'      },
]

export default function ReservasPaneles() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

      {/* Políticas de cancelación */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-zinc-900 text-sm">Políticas de cancelación</h3>
          <button className="text-zinc-400 hover:text-zinc-700 transition"><Pencil size={14} /></button>
        </div>
        <div className="space-y-2.5">
          {POLITICAS.map((p, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className={`w-2 h-2 rounded-full ${p.color} flex-shrink-0 mt-1.5`} />
              <p className="text-zinc-600 text-sm">{p.texto}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Alertas automáticas */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-zinc-900 text-sm">Alertas automáticas</h3>
          <button className="text-zinc-400 hover:text-zinc-700 transition"><Pencil size={14} /></button>
        </div>
        <div className="space-y-2.5">
          {ALERTAS.map((a, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className={`w-2 h-2 rounded-full ${a.color} flex-shrink-0 mt-1.5`} />
              <p className="text-zinc-600 text-sm">{a.texto}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={14} className="text-zinc-700" />
          <h3 className="font-bold text-zinc-900 text-sm">Quick actions</h3>
        </div>
        <div className="space-y-2">
          <button className="w-full flex items-center justify-between bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition">
            <span>Enviar recordatorios</span>
            <Send size={14} />
          </button>
          <button className="w-full flex items-center justify-between bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 px-4 py-2.5 rounded-xl text-sm font-medium transition">
            <span>Exportar reporte</span>
            <Upload size={14} />
          </button>
          <button className="w-full flex items-center justify-between bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 px-4 py-2.5 rounded-xl text-sm font-medium transition">
            <span>Ver historial</span>
            <Eye size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}