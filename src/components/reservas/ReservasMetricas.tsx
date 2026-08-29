'use client'

interface Props {
  reservas: number
  cancelaciones: number
  noShows: number
  tasaAsistencia: number
}

export default function ReservasMetricas({ reservas, cancelaciones, noShows, tasaAsistencia }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
        <p className="text-zinc-500 text-xs font-medium">Reservas</p>
        <p className="text-3xl font-black text-blue-600 mt-1">{reservas}</p>
      </div>
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
        <p className="text-zinc-500 text-xs font-medium">Cancelaciones</p>
        <p className="text-3xl font-black text-red-500 mt-1">{cancelaciones}</p>
      </div>
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
        <p className="text-zinc-500 text-xs font-medium">No-shows</p>
        <p className="text-3xl font-black text-orange-500 mt-1">{noShows}</p>
      </div>
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
        <p className="text-zinc-500 text-xs font-medium">Tasa de asistencia</p>
        <p className="text-3xl font-black text-green-500 mt-1">{tasaAsistencia}%</p>
      </div>
    </div>
  )
}