'use client'
import { Calendar, RefreshCw, Pause, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import ToastExito         from '@/components/ToastExito'
import ModalPagoSucursal  from '@/components/clientes/ModalPagoSucursal'

interface Props { cliente: any; reservas: any[] }

function ToastPendiente({ msg, onClose }: { msg: string; onClose: () => void }) {
  return <ToastExito titulo="Próximamente" mensaje={msg} onClose={onClose} duracion={3000} />
}

export default function TabMembresia({ cliente, reservas }: Props) {
  const [toast,        setToast]        = useState<string | null>(null)
  const [modalPago,    setModalPago]    = useState(false)

  const fechaVenc    = cliente.fecha_vencimiento_memb || cliente.fecha_venc_plan
  const diasVenc     = fechaVenc ? Math.ceil((new Date(fechaVenc).getTime() - Date.now()) / (1000*3600*24)) : null
  const clasesUsadas = reservas.filter(r => r.estatus === 'Confirmada').length
  const clasesTotal  = cliente.paquetes?.numero_clases || null

  return (
    <div className="space-y-5">
      {toast && <ToastPendiente msg={toast} onClose={() => setToast(null)} />}

      <ModalPagoSucursal
        isOpen={modalPago}
        cliente={cliente}
        onClose={() => setModalPago(false)}
        onSuccess={() => setModalPago(false)}
      />

      {/* Plan actual */}
      <div className="border border-gray-100 rounded-2xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-gray-400 font-medium mb-1">Plan actual</p>
            <p className="text-lg font-black text-gray-900">{cliente.plan || '—'}</p>
          </div>
          <p className="text-xl font-black text-gray-900">
            ${cliente.valor_cliente ? Number(cliente.valor_cliente).toLocaleString() : '—'}
          </p>
        </div>

        {clasesTotal && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>Clases usadas</span>
              <span className="font-bold text-gray-800">{clasesUsadas}/{clasesTotal}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-gray-900 h-2 rounded-full transition-all"
                style={{ width: `${Math.min((clasesUsadas/clasesTotal)*100, 100)}%` }} />
            </div>
          </div>
        )}

        {fechaVenc && (
          <div className="flex items-center gap-2 text-sm mb-5">
            <Calendar size={14} className="text-gray-400"/>
            <span className="font-bold text-gray-700">
              Vence el {new Date(fechaVenc).toLocaleDateString('es-MX', { year:'numeric', month:'2-digit', day:'2-digit' }).replace(/\//g,'-')}
            </span>
            {diasVenc !== null && (
              <span className={`text-xs font-medium ${diasVenc <= 7 ? 'text-orange-500' : 'text-gray-400'}`}>
                · En {diasVenc} días
              </span>
            )}
          </div>
        )}

        {/* Botones acción */}
        <div className="flex gap-2">
          <button
            onClick={() => setModalPago(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white transition"
            style={{ backgroundColor: '#171B24' }}>
            <RefreshCw size={12}/> Renovar / cambiar plan
          </button>
          <button onClick={() => setToast('Pausar membresía estará disponible próximamente.')}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition">
            <Pause size={12}/> Pausar membresía
          </button>
          <button onClick={() => setToast('Reembolsos estarán disponibles con la integración de Stripe.')}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition">
            <RotateCcw size={12}/> Reembolsar
          </button>
        </div>
      </div>

      {/* Políticas */}
      <div className="border border-gray-100 rounded-2xl p-4">
        <p className="text-xs font-bold text-gray-500 mb-4">Políticas aplicadas</p>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Cancelación gratuita', val: '4hrs antes'      },
            { label: 'Cargo No-Show',        val: '$35,000'         },
            { label: 'Bloqueo de cuenta',    val: 'Tras 3 No-Shows' },
            { label: 'Renovación Auto',      val: 'Activa'          },
          ].map(p => (
            <div key={p.label}>
              <p className="text-xs text-gray-400">{p.label}</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">{p.val}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}