// 'use client'
// import { useEffect } from 'react'

// interface Sucursal { id: string; nombre: string; color: string }

// interface SplitRow {
//   sucursal_origen_id:  string
//   sucursal_destino_id: string
//   porcentaje:          number
// }

// interface Props {
//   sucursalesActivas: Sucursal[]
//   precios:           { sucursal_id: string; precio_app: string }[]
//   splits:            SplitRow[]
//   onChange:          (splits: SplitRow[]) => void
// }

// function hexSoftBg(hex: string) {
//   if (!hex || hex.length < 7) return '#f3f4f6'
//   const r = parseInt(hex.slice(1,3),16)
//   const g = parseInt(hex.slice(3,5),16)
//   const b = parseInt(hex.slice(5,7),16)
//   return `rgba(${r},${g},${b},0.12)`
// }

// export default function TabSplitsRevenue({ sucursalesActivas, precios, splits, onChange }: Props) {

//   // Inicializar splits con defaults cuando cambian las sucursales activas
//   useEffect(() => {
//     if (sucursalesActivas.length === 0) {
//       onChange([])
//       return
//     }

//     // Recalcular splits basado en las sucursales activas actuales
//     // Filtrar splits que ya no tienen sucursales válidas
//     const idsActivos = sucursalesActivas.map(s => s.id)
//     const splitsFiltrados = splits.filter(s =>
//       idsActivos.includes(s.sucursal_origen_id) &&
//       idsActivos.includes(s.sucursal_destino_id)
//     )

//     // Verificar si faltan combinaciones
//     const faltanCombinaciones = sucursalesActivas.some(origen =>
//       !splitsFiltrados.some(s => s.sucursal_origen_id === origen.id && s.sucursal_destino_id === origen.id)
//     )

//     if (!faltanCombinaciones && splitsFiltrados.length === splits.length) return

//     // Crear defaults solo para combinaciones faltantes
//     const nuevos: SplitRow[] = [...splitsFiltrados]
//     const pctSecundario = sucursalesActivas.length > 1
//       ? Math.floor(15 / (sucursalesActivas.length - 1))
//       : 0

//     sucursalesActivas.forEach(origen => {
//       const tienePropio = nuevos.some(s =>
//         s.sucursal_origen_id === origen.id && s.sucursal_destino_id === origen.id
//       )
//       if (!tienePropio) {
//         nuevos.push({ sucursal_origen_id: origen.id, sucursal_destino_id: origen.id, porcentaje: 85 })
//       }
//       sucursalesActivas.filter(d => d.id !== origen.id).forEach(destino => {
//         const tieneDestino = nuevos.some(s =>
//           s.sucursal_origen_id === origen.id && s.sucursal_destino_id === destino.id
//         )
//         if (!tieneDestino) {
//           nuevos.push({ sucursal_origen_id: origen.id, sucursal_destino_id: destino.id, porcentaje: pctSecundario })
//         }
//       })
//     })

//     onChange(nuevos)
//   }, [sucursalesActivas])

//   const getPrecioSucursal = (sucursalId: string) => {
//     const p = precios.find(p => p.sucursal_id === sucursalId)
//     return Number(p?.precio_app || 0)
//   }

//   const totalHolding = sucursalesActivas.reduce((acc, s) => acc + getPrecioSucursal(s.id), 0)

//   const getPct = (origenId: string, destinoId: string) =>
//     splits.find(s => s.sucursal_origen_id === origenId && s.sucursal_destino_id === destinoId)?.porcentaje || 0

//   const updateSplit = (origenId: string, destinoId: string, pct: number) => {
//     const clamped = Math.min(100, Math.max(0, pct))
//     const existe  = splits.find(s => s.sucursal_origen_id === origenId && s.sucursal_destino_id === destinoId)
//     if (existe) {
//       onChange(splits.map(s =>
//         s.sucursal_origen_id === origenId && s.sucursal_destino_id === destinoId
//           ? { ...s, porcentaje: clamped } : s
//       ))
//     } else {
//       onChange([...splits, { sucursal_origen_id: origenId, sucursal_destino_id: destinoId, porcentaje: clamped }])
//     }
//   }

//   const getTotalOrigen = (origenId: string) =>
//     splits.filter(s => s.sucursal_origen_id === origenId)
//       .reduce((acc, s) => acc + (s.porcentaje || 0), 0)

//   const todosCompletos = sucursalesActivas.every(s => Math.abs(getTotalOrigen(s.id) - 100) < 0.01)

//   if (sucursalesActivas.length === 0) return (
//     <div className="px-6 py-12 text-center text-gray-400 text-sm italic">
//       Activa al menos una sucursal en la tab anterior para configurar splits.
//     </div>
//   )

//   return (
//     <div className="px-6 py-5 space-y-4">

//       {/* Info banner */}
//       <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2">
//         <span className="text-blue-500 text-sm mt-0.5">ℹ</span>
//         <div>
//           <p className="text-xs font-bold text-blue-700">Modelo de reparto</p>
//           <p className="text-xs text-blue-500">
//             Cómo se reparte el revenue entre las verticales y sucursales de cada paquete vendido
//           </p>
//         </div>
//       </div>

//       {/* Cuenta de pago */}
//       <div>
//         <p className="text-xs font-bold text-gray-700 mb-2">Cuenta de pago*</p>
//         <div className="border border-gray-200 rounded-2xl overflow-hidden">

//           {/* Header Holding */}
//           <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
//             <div className="flex items-center gap-2">
//               <span className="text-sm">⚡</span>
//               <span className="text-sm font-bold text-gray-800">Holding</span>
//             </div>
//             <span className="text-xs text-gray-400">100% a Holding Group</span>
//           </div>

//           {/* Holding group total */}
//           <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
//             <div className="flex items-center gap-2">
//               <span className="w-2.5 h-2.5 rounded-full bg-gray-900 flex-shrink-0" />
//               <span className="text-sm font-bold text-gray-800">Holding group</span>
//             </div>
//             <span className="text-sm font-black text-gray-900">
//               ${totalHolding.toLocaleString()}
//             </span>
//           </div>

//           {/* Por cada sucursal origen */}
//           {sucursalesActivas.map((origen, idx) => {
//             const precioOrigen = getPrecioSucursal(origen.id)
//             const totalPct     = getTotalOrigen(origen.id)
//             const falta        = 100 - totalPct
//             const completo     = Math.abs(falta) < 0.01
//             const pctPropia    = getPct(origen.id, origen.id)
//             const montoPropio  = Math.round(precioOrigen * pctPropia / 100)

//             return (
//               <div key={origen.id} className="border-t border-gray-100">

//                 {/* Sucursal origen — fila principal destacada */}
//                 <div className="flex items-center gap-3 px-4 py-3 bg-gray-50/60">
//                   <div className="flex items-center gap-2 flex-1">
//                     <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
//                       style={{ backgroundColor: origen.color }} />
//                     <span className="text-sm font-black text-gray-900">{origen.nombre}</span>
//                     <span className="text-xs text-gray-400">— ${precioOrigen.toLocaleString()}</span>
//                   </div>
//                   {/* Controles del 85% propio */}
//                   <div className="flex items-center gap-2">
//                     <button onClick={() => updateSplit(origen.id, origen.id, Math.max(0, pctPropia - 5))}
//                       className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs">
//                       −
//                     </button>
//                     <span className="w-12 text-center text-sm font-black text-gray-900">{pctPropia}%</span>
//                     <button onClick={() => updateSplit(origen.id, origen.id, Math.min(100, pctPropia + 5))}
//                       className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs">
//                       +
//                     </button>
//                     <span className="w-16 text-right text-sm font-black text-gray-900">
//                       ${montoPropio.toLocaleString()}
//                     </span>
//                   </div>
//                 </div>

//                 {/* Sucursales destino secundarias */}
//                 {sucursalesActivas
//                   .filter(d => d.id !== origen.id)
//                   .map(destino => {
//                     const pct   = getPct(origen.id, destino.id)
//                     const monto = Math.round(precioOrigen * pct / 100)
//                     return (
//                       <div key={destino.id}
//                         className="flex items-center gap-3 px-4 py-2.5 border-t border-gray-50">
//                         <div className="flex items-center gap-2 flex-1 pl-4">
//                           <span className="w-2 h-2 rounded-full flex-shrink-0"
//                             style={{ backgroundColor: destino.color }} />
//                           <span className="text-xs font-bold"
//                             style={{ color: destino.color }}>
//                             Sucursal {destino.nombre}
//                           </span>
//                         </div>
//                         <div className="flex items-center gap-2">
//                           <button onClick={() => updateSplit(origen.id, destino.id, Math.max(0, pct - 5))}
//                             className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs">
//                             −
//                           </button>
//                           <span className="w-12 text-center text-sm font-bold text-gray-700">{pct}%</span>
//                           <button onClick={() => updateSplit(origen.id, destino.id, Math.min(100, pct + 5))}
//                             className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-500 text-xs">
//                             +
//                           </button>
//                           <span className="w-16 text-right text-xs font-bold text-gray-500">
//                             ${monto.toLocaleString()}
//                           </span>
//                         </div>
//                       </div>
//                     )
//                   })
//                 }

//                 {/* Indicador de suma por origen */}
//                 <div className={`flex items-center justify-between px-4 py-1.5 border-t ${
//                   completo ? 'bg-emerald-50/50' : 'bg-amber-50/50'
//                 }`}>
//                   <span className="text-[11px] text-gray-400">
//                     Split {pctPropia}/{100 - pctPropia}
//                   </span>
//                   <span className={`text-[11px] font-bold ${completo ? 'text-emerald-500' : 'text-amber-500'}`}>
//                     {completo ? `✓ Suma 100%` : `⚠ Falta ${falta.toFixed(0)}%`}
//                   </span>
//                 </div>
//               </div>
//             )
//           })}

//           {/* Total global */}
//           <div className={`flex items-center justify-between px-4 py-3 border-t ${
//             todosCompletos ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'
//           }`}>
//             <span className="text-sm font-bold text-gray-700">Total</span>
//             <span className={`text-sm font-black ${todosCompletos ? 'text-emerald-600' : 'text-amber-600'}`}>
//               {todosCompletos
//                 ? `100% Holding Group $${totalHolding.toLocaleString()}`
//                 : `⚠ Verifica que cada sucursal sume 100%`
//               }
//             </span>
//           </div>

//           {/* Banner verde/amarillo */}
//           <div className={`mx-4 mb-4 mt-1 px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
//             todosCompletos
//               ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
//               : 'bg-amber-50 border-amber-200 text-amber-600'
//           }`}>
//             {todosCompletos
//               ? `✓ Suma 100% · Total ${totalHolding.toLocaleString()}`
//               : `⚠ Suma incompleta · Falta por repartir`
//             }
//           </div>
//         </div>
//       </div>
//     </div>
//   )
// }

'use client'
import { supabase } from '@/lib/supabase'
import { useState, useEffect } from 'react'

interface Props {
  sucursalesActivas: { id: string; nombre: string; color: string }[]
  precios:           any[]
  splits:            any[]
  onChange:          (splits: any[]) => void
}

export default function TabSplitsRevenue({ sucursalesActivas, precios, splits, onChange }: Props) {
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState<string>(
    splits?.[0]?.sucursal_destino_id || ''
  )

  // Cuando cambia la sucursal — genera un split de 100%
  const handleSelect = (sucursalId: string) => {
    setSucursalSeleccionada(sucursalId)
    if (!sucursalId) { onChange([]); return }
    // Un solo split del 100% a la sucursal seleccionada
    onChange([{
      sucursal_origen_id:  sucursalId,
      sucursal_destino_id: sucursalId,
      porcentaje:          100,
    }])
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <p className="text-sm font-black text-gray-900 mb-1">Sucursal destino</p>
        <p className="text-xs text-gray-400 mb-4">
          El 100% de los ingresos de este paquete irán a la sucursal seleccionada.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {sucursalesActivas.map(s => (
            <button
              key={s.id}
              onClick={() => handleSelect(s.id)}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition ${
                sucursalSeleccionada === s.id
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-100 hover:border-gray-300'
              }`}>
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.color || '#6b7280' }}
              />
              <span className="text-sm font-bold text-gray-900">{s.nombre}</span>
              {sucursalSeleccionada === s.id && (
                <span className="ml-auto text-xs font-black text-gray-900 bg-gray-200 px-2 py-0.5 rounded-full">
                  100%
                </span>
              )}
            </button>
          ))}
        </div>

        {sucursalSeleccionada && (
          <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500">
              ✓ Los ingresos de este paquete se registrarán al 100% en{' '}
              <strong className="text-gray-900">
                {sucursalesActivas.find(s => s.id === sucursalSeleccionada)?.nombre}
              </strong>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}