'use client'
import { Star, Award, CheckCircle2, AlertCircle } from 'lucide-react'

interface Props {
  checkin: any
}

function hexSoftBg(hex: string) {
  if (!hex || hex.length < 7) return '#f3f4f6'
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},0.12)`
}

export default function CheckinFeedItem({ checkin }: Props) {
  const cliente     = checkin.clientes || {}
  const clase       = checkin.clases || {}
  const nombre      = cliente.nombre_completo || 'Cliente'
  const nombreClase = clase.nombre_clase || 'Clase'
  const sucursal    = checkin.sucursales?.nombre || ''
  const color       = checkin.sucursales?.color || '#6366f1'
  const hora        = checkin.fecha_checkin 
    ? new Date(checkin.fecha_checkin).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : '--:--'

  // Variables para la fase Valkiria
  const esNuevo           = checkin.es_nuevo_cliente || cliente.es_primera_vez
  const origen            = cliente.origen || 'Directo'
  const integracion       = (cliente.integracion || '').toLowerCase()
  const tienePaquete      = cliente.tiene_paquete_activo
  const clasesAcumuladas = cliente.clases_acumuladas || 0
  const totalAsistentes   = clase.total_asistentes

  return (
    <div className="flex flex-col gap-2 px-5 py-3.5 hover:bg-gray-50 transition">
      {/* Fila principal: Avatar, Nombre, Badges e Integraciones */}
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <div 
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
          style={{ backgroundColor: hexSoftBg(color), color }}
        >
          {nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
        </div>

        {/* Info principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-gray-900 truncate">{nombre}</p>

            {/* Badge: Primera vez / Nuevo */}
            {esNuevo && (
              <span className="flex items-center gap-0.5 text-[10px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                <Star size={8} className="fill-amber-500 text-amber-500" /> 1ª Vez
              </span>
            )}

            {/* Badges: Wellhub y Totalpass */}
            {(integracion.includes('wellhub') || integracion.includes('gympass')) && (
              <span className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                Wellhub
              </span>
            )}
            {integracion.includes('totalpass') && (
              <span className="text-[10px] font-black text-white bg-black px-1.5 py-0.5 rounded-full flex-shrink-0">
                Totalpass
              </span>
            )}
          </div>

          <p className="text-xs text-gray-400 truncate">{nombreClase} · {sucursal}</p>
        </div>

        {/* Hora */}
        <p className="text-xs font-bold text-gray-400 flex-shrink-0">{hora}</p>
      </div>

      {/* Fila secundaria: Detalles obligatorios de producción */}
      <div className="flex flex-wrap items-center gap-2 text-[10px] pl-13 pt-0.5">
        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">
          Origen: <strong>{origen}</strong>
        </span>

        <span className={`px-1.5 py-0.5 rounded font-semibold flex items-center gap-1 ${
          tienePaquete ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          {tienePaquete ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
          {tienePaquete ? 'Paquete Activo' : 'Sin Paquete'}
        </span>

        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded font-semibold flex items-center gap-1">
          <Award size={10} />
          {clasesAcumuladas} clases
        </span>

        {totalAsistentes !== undefined && (
          <span className="px-1.5 py-0.5 bg-gray-50 text-gray-500 border border-gray-200 rounded ml-auto font-medium">
            Total Clase: {totalAsistentes}
          </span>
        )}
      </div>
    </div>
  )
}