'use client'

interface Props {
  totalActivo:      number
  coaches:          number
  staffOperativo:   number
  horasTrabajadas:  number
  clasesImpartidas: number
  nominaPeriodo:    number
  bonos:            number
}

export default function StaffMetricas({
  totalActivo, coaches, staffOperativo,
  horasTrabajadas, clasesImpartidas, nominaPeriodo, bonos
}: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

      {/* Total staff activo */}
      <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm flex flex-col gap-1">
        <p className="text-xs font-medium text-gray-400">Total staff activo</p>
        <p className="text-2xl font-black" style={{ color: '#2563eb' }}>{totalActivo}</p>
        <p className="text-[11px] text-gray-400">
          {coaches} coaches · {staffOperativo} Staff operativo
        </p>
      </div>

      {/* Horas trabajadas */}
      <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm flex flex-col gap-1">
        <p className="text-xs font-medium text-gray-400">Horas trabajadas /mes</p>
        <p className="text-2xl font-black" style={{ color: '#16a34a' }}>
          {horasTrabajadas.toLocaleString()}
        </p>
        <p className="text-[11px] text-gray-400">hrs / mes</p>
      </div>

      {/* Clases impartidas */}
      <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm flex flex-col gap-1">
        <p className="text-xs font-medium text-gray-400">Clases impartidas</p>
        <p className="text-2xl font-black" style={{ color: '#16a34a' }}>{clasesImpartidas}</p>
        <p className="text-[11px] text-gray-400">82% de ocupación promedio</p>
      </div>

      {/* Nómina del período */}
      <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm flex flex-col gap-1">
        <p className="text-xs font-medium text-gray-400">Nómina del período</p>
        <p className="text-2xl font-black" style={{ color: '#16a34a' }}>
          ${nominaPeriodo.toLocaleString()}
        </p>
        <p className="text-[11px] text-gray-400">
          ${bonos.toLocaleString()} en bonos
        </p>
      </div>

    </div>
  )
}