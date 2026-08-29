'use client'
import Link from 'next/link'

interface Props {
  integ:         any
  onConectar:    (id: string) => void
  onDesconectar: (id: string) => void
}

const STATS_MOCK: Record<string, string[]> = {
  'stripe':     ['184 transacciones hoy', '$284K Volumen'],
  'fitpass':    ['45 Check-ins hoy', '$209k Revenue'],
  'inbody':     ['342 mediciones', '2 Dispositivos'],
  'total-pass': ['37 Check-ins hoy', '$209k Revenue'],
}

export default function IntegracionCard({ integ, onConectar, onDesconectar }: Props) {
  const conectada = integ.estatus === 'Conectada'
  const stats     = STATS_MOCK[integ.slug] || []

  return (
    <div className="border border-gray-100 rounded-2xl p-5 hover:border-gray-200 transition bg-white flex flex-col gap-4">

      {/* Badge estatus — arriba a la derecha */}
      <div className="flex justify-end">
        {conectada ? (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600">
            Conectado
          </span>
        ) : (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-400">
            Desconectado
          </span>
        )}
      </div>

      {/* Logo + Nombre + Descripción */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ backgroundColor: `${integ.logo_color}15` }}>
            {integ.logo_emoji}
        </div>
        <div>
            <p className="text-sm font-black text-gray-900">{integ.nombre}</p>
        </div>
      </div>
      <div>
        <p className="text-sm text-gray-600 mt-0.5">{integ.descripcion}</p>
      </div>

      {/* Stats en línea con · */}
      {conectada && stats.length > 0 && (
        <p className="text-[11px] text-gray-400">
          {stats.join(' · ')}
        </p>
      )}

      {/* Botones */}
      <div className="flex gap-2">
        {conectada ? (
          <>
            <button onClick={() => onDesconectar(integ.id)}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition">
              Desconectar
            </button>
            <Link href={`/dashboard/integraciones/${integ.slug}`}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white text-center transition"
              style={{ backgroundColor: '#171B24' }}>
              Configuración
            </Link>
          </>
        ) : (
          <>
            <button onClick={() => onDesconectar(integ.id)}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-400 hover:bg-gray-50 transition">
              Eliminar
            </button>
            <button onClick={() => onConectar(integ.id)}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition"
              style={{ backgroundColor: '#171B24' }}>
              Conectar
            </button>
          </>
        )}
      </div>
    </div>
  )
}