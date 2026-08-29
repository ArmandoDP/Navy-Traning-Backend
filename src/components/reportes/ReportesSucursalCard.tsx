'use client'
import Link from 'next/link'

interface Props {
  sucursal:  any
  periodo:   string
  nomina:    number
  horas:     number
  clases:    number
  empleados: number
}

export default function ReportesSucursalCard({ sucursal, periodo, nomina, horas, clases, empleados }: Props) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">📍</span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-black text-gray-900">{sucursal.nombre}</p>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                Activa
              </span>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400">{empleados} empleados</p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-400">Nómina</p>
          <p className="text-lg font-black text-emerald-500">${nomina.toLocaleString()}</p>
          <p className="text-[11px] text-gray-400">+8% vs abril</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Horas</p>
          <p className="text-lg font-black text-blue-500">{horas.toLocaleString()}h</p>
          <p className="text-[11px] text-gray-400">{empleados} empleados</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Clases</p>
          <p className="text-lg font-black text-gray-900">{clases}</p>
          <p className="text-[11px] text-gray-400">impartidas</p>
        </div>
      </div>

      {/* Botón */}
      <Link href={`/dashboard/reportes/${sucursal.id}?periodo=${periodo}`}
        className="mt-4 w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center transition"
        style={{ backgroundColor: '#171B24' }}>
        Ver detalles
      </Link>
    </div>
  )
}