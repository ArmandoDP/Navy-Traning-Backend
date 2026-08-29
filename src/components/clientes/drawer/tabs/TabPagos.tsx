'use client'
import { CreditCard } from 'lucide-react'

interface Props { pagos: any[] }

export default function TabPagos({ pagos }: Props) {
  const sorted     = [...pagos].sort((a, b) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime())
  const totalPagado = pagos.reduce((a, p) => a + Number(p.monto), 0)
  const metodo      = pagos[0]?.metodo_pago || '—'

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-gray-100 rounded-2xl p-4">
          <p className="text-xs text-gray-400 mb-1">Total pagado</p>
          <p className="text-2xl font-black text-gray-900">${totalPagado.toLocaleString()}</p>
        </div>
        <div className="border border-gray-100 rounded-2xl p-4">
          <p className="text-xs text-gray-400 mb-1">Método de pago</p>
          <div className="flex items-center gap-2">
            <CreditCard size={16} className="text-gray-400"/>
            <p className="text-sm font-bold text-gray-900">{metodo}</p>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Stripe disponible próximamente</p>
        </div>
      </div>

      {/* Historial */}
      <div className="space-y-1">
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-8">Sin pagos registrados</p>
        ) : sorted.map(p => (
          <div key={p.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
            <div>
              <p className="text-sm font-bold text-gray-900">{p.concepto || 'Pago de membresía'}</p>
              <p className="text-[11px] text-gray-400">
                {new Date(p.fecha_pago).toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' })}
                {' · '}{p.metodo_pago || '—'}
                {p.sucursales?.nombre ? ` · ${p.sucursales.nombre}` : ''}
              </p>
            </div>
            <p className="text-sm font-black text-gray-900">${Number(p.monto).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  )
}