'use client'
import CheckinScanner    from './CheckinScanner'
import CheckinFeed       from './CheckinFeed'
import CheckinContadores from './CheckinContadores'

interface Props {
  sucursalId:     string | null
  sucursalNombre: string
  checkins:       any[]
  loading:        boolean
  onCheckin:      () => void
}

export default function CheckinLayout({ sucursalId, sucursalNombre, checkins, loading, onCheckin }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

      {/* Izquierda — Scanner */}
      <div className="space-y-4">
        <CheckinContadores checkins={checkins} />
        <CheckinScanner
          sucursalId={sucursalId}
          sucursalNombre={sucursalNombre}
          onCheckin={onCheckin}
        />
      </div>

      {/* Derecha — Feed */}
      <CheckinFeed checkins={checkins} loading={loading} />
    </div>
  )
}