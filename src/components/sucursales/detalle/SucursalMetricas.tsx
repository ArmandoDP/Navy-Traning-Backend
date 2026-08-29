'use client'
import { TrendingUp, TrendingDown } from 'lucide-react'
import Sparkline from './Sparkline'

interface Props {
  ingresosMes:      number
  deltaIngresos:    number
  ingresosSerie:    number[]
  retencion:        number
  deltaRetencion:   number
  retencionSerie:   number[]
}

function MetricCard({ label, value, delta, serie, valueColor }: {
  label:      string
  value:      string
  delta:      number
  serie:      number[]
  valueColor?: string
}) {
  const pos   = delta >= 0
  const color = pos ? '#22c55e' : '#ef4444'
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 font-medium mb-2">{label}</p>
          <p className="text-2xl font-black" style={{ color: valueColor || '#111827' }}>{value}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`flex items-center gap-0.5 text-xs font-bold ${pos ? 'text-green-500' : 'text-red-500'}`}>
            {pos ? <TrendingUp size={11}/> : <TrendingDown size={11}/>}
            {pos ? '+' : ''}{delta}%
          </span>
          <Sparkline data={serie} color={color} />
        </div>
      </div>
    </div>
  )
}

export default function SucursalMetricas({
  ingresosMes, deltaIngresos, ingresosSerie,
  retencion,   deltaRetencion, retencionSerie
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <MetricCard
        label="Ingresos mensuales"
        value={`$${ingresosMes.toLocaleString()}`}
        delta={deltaIngresos}
        serie={ingresosSerie}
      />
      <MetricCard
        label="Retención"
        value={`${retencion}%`}
        delta={deltaRetencion}
        serie={retencionSerie}
        valueColor="#6366f1"
      />
    </div>
  )
}