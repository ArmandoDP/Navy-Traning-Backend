'use client'
import { useState }                    from 'react'
import { Plus, Eye, Pencil }           from 'lucide-react'
import RoomViewer                      from '@/components/sucursales/rooms/RoomViewer'
import DrawerEditarRoom                from '@/components/sucursales/rooms/DrawerEditarRoom'

interface Room {
  id:          string
  nombre:      string
  descripcion: string
  capacidad:   number
  ancho:       number
  alto:        number
  layout:      any[]
  room_spots:  any[]
}

interface Props {
  clases:      any[]
  rooms:       Room[]
  onCrearRoom: () => void
  onRefresh:   () => void
}

export default function SucursalRooms({ clases, rooms, onCrearRoom, onRefresh }: Props) {
  const [roomViewing, setRoomViewing] = useState<Room | null>(null)
  const [roomEditing, setRoomEditing] = useState<Room | null>(null)

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-900">Rooms</h3>
            {rooms.length > 0 && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                {rooms.length}
              </span>
            )}
          </div>
          <button onClick={onCrearRoom}
            className="flex items-center gap-1 text-indigo-500 hover:text-indigo-700 text-sm font-bold transition">
            <Plus size={14} /> Crear nuevo room
          </button>
        </div>

        {rooms.length === 0 ? (
          <div className="p-10 text-center text-gray-400 italic text-sm">
            No hay rooms en esta sucursal
          </div>
        ) : roomViewing ? (
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setRoomViewing(null)}
                className="text-xs font-bold text-gray-400 hover:text-gray-700 transition flex items-center gap-1">
                ← Volver
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => { setRoomViewing(null); setRoomEditing(roomViewing) }}
                  className="flex items-center gap-1 text-xs font-bold text-indigo-500 hover:text-indigo-700 transition">
                  <Pencil size={12} /> Editar
                </button>
                <p className="text-xs text-gray-400">
                  {roomViewing.room_spots.filter((s: any) => !s.bloqueado).length} spots · {roomViewing.capacidad} max
                </p>
              </div>
            </div>
            <RoomViewer
              nombre={roomViewing.nombre}
              ancho={roomViewing.ancho}
              alto={roomViewing.alto}
              layout={roomViewing.layout}
              spots={roomViewing.room_spots}
              readonly={true}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-gray-100">
            {rooms.map(r => {
              const spotsTotal     = r.room_spots.length
              const spotsBloqueados = r.room_spots.filter((s: any) => s.bloqueado).length
              const spotsLibres    = spotsTotal - spotsBloqueados

              return (
                <div key={r.id} className="bg-white p-4 hover:bg-gray-50 transition">
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-sm font-bold text-gray-900 leading-tight">{r.nombre}</p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setRoomEditing(r)}
                        className="p-1 hover:bg-gray-100 rounded-lg text-gray-300 hover:text-indigo-500 transition">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => setRoomViewing(r)}
                        className="p-1 hover:bg-gray-100 rounded-lg text-gray-300 hover:text-indigo-500 transition">
                        <Eye size={13} />
                      </button>
                    </div>
                  </div>

                  {r.descripcion && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{r.descripcion}</p>
                  )}

                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-400">
                      Capacidad <span className="font-bold text-gray-700">{r.capacidad} spots</span>
                    </p>
                    <p className="text-xs text-gray-400">
                      Grid <span className="font-bold text-gray-700">{r.ancho}×{r.alto}</span>
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full"
                          style={{ width: `${spotsTotal > 0 ? (spotsLibres / spotsTotal) * 100 : 0}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {spotsLibres}/{spotsTotal}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Drawer editar */}
      <DrawerEditarRoom
        isOpen={!!roomEditing}
        room={roomEditing}
        onClose={() => setRoomEditing(null)}
        onSuccess={() => { setRoomEditing(null); onRefresh() }}
      />
    </>
  )
}