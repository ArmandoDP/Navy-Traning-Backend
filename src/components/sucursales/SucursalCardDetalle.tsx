'use client'
import { TrendingUp, TrendingDown, MapPin } from 'lucide-react'
import Link from 'next/link'

// Paleta de colores para sucursales sin color asignado
const PALETTE = ['#6366f1','#f97316','#22c55e','#3b82f6','#ec4899','#8b5cf6','#14b8a6','#f59e0b']

function getColor(color: string, nombre: string, idx?: number) {
  if (color && color !== '#6366f1') return color
  // Fallback por índice o hash del nombre
  const hash = nombre.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return PALETTE[hash % PALETTE.length]
}
  interface Props {
    id:            string
    nombre:        string
    ciudad:        string
    gerente:       string
    estatus:       string
    ingresos:      number
    retencion:     number
    crecimiento:   number
    capacidad:     number
    totalClientes: number
    activos:       number
    lost:          number
    failed:        number
    expired:       number
    color:         string
    onEditar:      () => void
  }

interface StatProps {
  label:  string
  valor:  number
  pct:    number
  color:  string
}

function Stat({ label, valor, pct, color, bg }: StatProps & { bg: string }) {
  return (
    <div
      className="flex-1 rounded-xl p-2.5 flex flex-col gap-1"
      style={{ backgroundColor: bg }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color }}>{label}</span>
        <span className="text-xs font-medium text-gray-400">{pct}%</span>
      </div>
      <span className="text-xl font-black" style={{ color }}>{valor}</span>
    </div>
  )
}

export default function SucursalCardDetalle({
  id, nombre, ciudad, gerente, estatus, ingresos, retencion,
  crecimiento, capacidad, totalClientes, activos, lost, failed, expired,
  color, onEditar
}: Props) {
  const pos       = crecimiento >= 0
  const iconColor = getColor(color, nombre)
  const iconBg    = `${iconColor}22`
  const total = totalClientes || 1
  const pct   = (v: number) => Math.round((v / total) * 100)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: iconBg }}>
            <MapPin size={30} style={{ color: iconColor }} strokeWidth={1.5} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-gray-900 text-base">{nombre}, {ciudad}</span>
              <span className="px-1.5 py-0.5 bg-green-100 text-green-600 text-[10px] font-bold rounded-full">
                {estatus}
              </span>
            </div>
            <p className="text-gray-400 text-xs mt-0.5">Gerente: {gerente || '—'}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wide">Crecimiento</p>
          <span className={`flex items-center justify-end gap-0.5 text-sm font-black mt-0.5 ${pos ? 'text-green-500' : 'text-red-500'}`}>
            {pos ? <TrendingUp size={13}/> : <TrendingDown size={13}/>}
            {pos ? '+' : ''}{crecimiento}%
          </span>
        </div>
      </div>

      {/* Ingresos + Retención */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-xs text-gray-400">Ingresos mensuales </span>
          <span className="text-sm font-black text-gray-900">${ingresos.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-xs text-gray-400">Retención: </span>
          <span className="text-sm font-black text-indigo-600">{retencion}%</span>
        </div>
      </div>

      {/* Clientes + Capacidad */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-xs text-gray-400">Clientes </span>
          <span className="text-sm font-bold text-gray-900">{totalClientes}</span>
        </div>
        <div>
          <span className="text-xs text-gray-400">Capacidad </span>
          <span className="text-sm font-bold text-gray-900">{capacidad}</span>
        </div>
      </div>

      {/* Stats Active/Lost/Failed/Expired */}
      <div className="flex gap-2 py-3 border-t border-b border-gray-100 mb-4">
        <Stat label="Active"  valor={activos}  pct={pct(activos)}  color="#16a34a" bg="#dcfce7" />
        <Stat label="Lost"    valor={lost}     pct={pct(lost)}     color="#dc2626" bg="#fee2e2" />
        <Stat label="Failed"  valor={failed}   pct={pct(failed)}   color="#d97706" bg="#fef3c7" />
        <Stat label="Expired" valor={expired}  pct={pct(expired)}  color="#6b7280" bg="#f3f4f6" />
      </div>

      {/* Botones */}
      <div className="flex gap-3">
        <button
          onClick={onEditar}
          className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition"
        >
          Editar
        </button>
        <Link
          href={`/dashboard/sucursales/${id}`}
          className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold text-center transition"
        >
          Ver detalles
        </Link>
      </div>
    </div>
  )
}