'use client'
import { TrendingUp, TrendingDown, DollarSign, Users, Activity } from 'lucide-react'

interface Props {
  ingresos:        number
  clientesActivos: number
  totalClientes:   number
  ocupacion:       number
  retencion:       number
  nominaTotal:     number
  deltaIngresos:   number
  deltaClientes:   number
}

function Delta({ value }: { value: number }) {
  const pos = value >= 0
  return (
    <span className={`flex items-center gap-0.5 text-xs font-bold ${pos ? 'text-green-500' : 'text-red-500'}`}>
      {pos ? <TrendingUp size={11}/> : <TrendingDown size={11}/>}
      {pos ? '+' : ''}{value}%
    </span>
  )
}

function Card({ icon, label, value, delta, sub }: {
  icon: React.ReactNode; label: string; value: string; delta: number; sub?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500">
          {icon}
        </div>
        <Delta value={delta} />
      </div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function DashboardMetricas({ ingresos, clientesActivos, totalClientes, ocupacion, retencion, nominaTotal, deltaIngresos, deltaClientes }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <Card icon={<DollarSign size={15}/>} label="Ingresos totales"   value={`$${ingresos.toLocaleString()}`}      delta={deltaIngresos} />
      <Card icon={<Users size={15}/>}      label="Clientes activos"   value={clientesActivos.toLocaleString()}     delta={deltaClientes} sub={`${totalClientes} totales`} />
      <Card icon={<Activity size={15}/>}   label="Ocupación promedio" value={`${ocupacion}%`}                      delta={0} />
      <Card icon={<Users size={15}/>}      label="Retención"          value={`${retencion}%`}                      delta={0} />
      <Card icon={<DollarSign size={15}/>} label="Nómina total"       value={`$${nominaTotal.toLocaleString()}`}   delta={0} />
    </div>
  )
}