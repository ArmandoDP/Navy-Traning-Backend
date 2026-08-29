'use client'
import { ItemType } from './RoomItemSelector'

export interface CeldaGrid {
  fila:    number
  columna: number
  tipo:    ItemType
  numero:  string | null
  bloqueado: boolean
}

interface Props {
  ancho:     number
  alto:      number
  celdas:    CeldaGrid[]
  itemSelected: ItemType
  zoom:      number
  onCeldaClick: (fila: number, columna: number) => void
}

const ITEM_CONFIG: Record<string, { bg: string; border: string; color: string }> = {
  Rack:    { bg: '#dcfce7', border: '#22c55e', color: '#15803d' },
  Mat:     { bg: '#f0f9ff', border: '#38bdf8', color: '#0369a1' },
  Coach:   { bg: '#171B24', border: '#171B24', color: '#ffffff' },
  Entrada: { bg: '#f9fafb', border: '#9ca3af', color: '#374151' },
}

function CeldaItem({ celda, size }: { celda: CeldaGrid; size: number }) {
  if (!celda.tipo) return null

  if (celda.tipo === 'Rack') return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-0.5 p-1">
      <svg width={size * 0.7} height={size * 0.3} viewBox="0 0 40 12" fill="none">
        <path d="M31.1942 7.47663V10.8827C31.1942 11.1734 31.4019 11.3811 31.6926 11.3811H34.2679C34.5171 11.3811 34.7664 11.1734 34.7664 10.8827V9.42887H36.8847C37.134 9.42887 37.3832 9.22118 37.3832 8.93043V7.47663H39.5016C39.7508 7.47663 40 7.26895 40 6.97819V4.40291C40 4.11215 39.7923 3.90446 39.5016 3.90446H37.3832V2.45067C37.3832 2.15992 37.1755 1.95223 36.8847 1.95223H34.7664V0.498442C34.7664 0.207684 34.5587 0 34.2679 0H31.6511C31.4019 0 31.1526 0.207684 31.1526 0.498442V3.90446H8.80581V0.498442C8.80581 0.207684 8.59813 0 8.30737 0H5.73209C5.44133 0 5.23364 0.207684 5.23364 0.498442V1.95223H3.11526C2.82451 1.95223 2.61682 2.15992 2.61682 2.45067V3.90446H0.498442C0.207684 3.90446 0 4.11215 0 4.40291V6.97819C0 7.26895 0.207684 7.47663 0.498442 7.47663H2.61682V8.93043C2.61682 9.22118 2.82451 9.42887 3.11526 9.42887H5.23364V10.8827C5.23364 11.1734 5.44133 11.3811 5.73209 11.3811H8.30737C8.55659 11.3811 8.80581 11.1734 8.80581 10.8827V7.47663H31.1942ZM2.65836 6.52129H1.03842V4.90135H2.65836V6.52129ZM5.27518 8.47352H3.65524V2.94912H5.27518V8.47352ZM7.85047 10.4258H6.23053V0.996885H7.85047V10.4258ZM31.2357 6.52129H8.80581V4.90135H31.1942V6.52129H31.2357ZM33.811 10.4258H32.1911V0.996885H33.811V10.4258ZM36.4278 8.47352H34.8079V2.94912H36.4278V8.47352ZM39.0031 6.52129H37.3832V4.90135H39.0031V6.52129Z"
          fill="#22c55e"/>
      </svg>
      {celda.numero && (
        <span className="text-[9px] font-black text-green-600">{celda.numero}</span>
      )}
    </div>
  )

  if (celda.tipo === 'Mat') return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-0.5 p-1">
      <svg width={size * 0.75} height={size * 0.4} viewBox="0 0 48 21" fill="none">
        <path d="M46.8012 19.4755L1.19875 19.4755L1.19875 0.998959L46.8012 0.998961V19.4755ZM48 20.0125L48 0.46202C48 0.208118 47.7503 1.71916e-06 47.4456 1.70806e-06L0.554424 0C0.249741 -1.10984e-08 1.03881e-06 0.208117 1.02549e-06 0.462019L0 20.0125C-1.33181e-08 20.2664 0.24974 20.4745 0.554423 20.4745L47.4456 20.4745C47.7503 20.4745 48 20.2664 48 20.0125ZM43.9043 17.0447L4.09573 17.0447L4.09573 3.43392L43.9043 3.43392V17.0447ZM44.9032 2.80957C44.9032 2.69303 44.7933 2.60146 44.6535 2.60146L3.34651 2.60146C3.20666 2.60146 3.09677 2.69303 3.09677 2.80957L3.09677 17.6691C3.09677 17.7856 3.20666 17.8772 3.34651 17.8772L44.6535 17.8772C44.7933 17.8772 44.9032 17.7856 44.9032 17.6691V2.80957Z"
          fill="#6D80A1"/>
      </svg>
      {celda.numero && (
        <span className="text-[9px] font-black text-blue-500">{celda.numero}</span>
      )}
    </div>
  )

  if (celda.tipo === 'Coach') return (
    <div className="flex items-center justify-center w-full h-full rounded-lg"
      style={{ backgroundColor: '#171B24' }}>
      <span className="text-[9px] font-black tracking-wider text-white">COACH</span>
    </div>
  )

  if (celda.tipo === 'Entrada') return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-0.5">
      <div className="border-2 border-gray-800 rounded-lg flex items-center justify-center"
        style={{ width: '75%', height: '55%' }}>
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
          <path d="M1 5h12M8 1l4 4-4 4" stroke="#171B24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <span className="text-[8px] font-bold text-gray-500">Entrada</span>
    </div>
  )

  return null
}

export default function RoomGrid({ ancho, alto, celdas, itemSelected, zoom, onCeldaClick }: Props) {
  if (ancho === 0 || alto === 0) return (
    <div className="flex items-center justify-center h-48 text-gray-400 text-sm italic">
      Define una cuadrícula para empezar a colocar spots.
    </div>
  )

  const cellSize = Math.max(40, Math.min(80, Math.floor((320 / ancho) * (zoom / 100))))

  const getCelda = (fila: number, columna: number) =>
    celdas.find(c => c.fila === fila && c.columna === columna)

  return (
    <div className="overflow-auto flex justify-center w-full p-3">
      <div
        className="inline-grid gap-1 p-2"
        style={{ gridTemplateColumns: `repeat(${ancho}, ${cellSize}px)` }}
      >
        {Array.from({ length: alto }, (_, fila) =>
          Array.from({ length: ancho }, (_, columna) => {
            const celda = getCelda(fila, columna)
            const bloqueado = celda?.bloqueado

            return (
              <div
                key={`${fila}-${columna}`}
                onClick={() => onCeldaClick(fila, columna)}
                className="rounded-lg border-2 cursor-pointer transition-all hover:scale-105 flex items-center justify-center relative"
                style={{
                  width:    cellSize,
                  height:   cellSize,
                  backgroundColor: bloqueado
                    ? '#e5e7eb'
                    : celda?.tipo
                      ? ITEM_CONFIG[celda.tipo]?.bg || '#fff'
                      : itemSelected ? '#f0f9ff' : '#f9fafb',
                  borderColor: bloqueado
                    ? '#d1d5db'
                    : celda?.tipo
                      ? ITEM_CONFIG[celda.tipo]?.border || '#e5e7eb'
                      : '#e5e7eb',
                  opacity: bloqueado ? 0.5 : 1,
                }}
              >
                {celda?.tipo
                  ? <CeldaItem celda={celda} size={cellSize} />
                  : <span className="text-[10px] text-gray-300">{fila},{columna}</span>
                }
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}