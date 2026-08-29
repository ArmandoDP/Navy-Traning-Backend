'use client'
import { useEffect, useState }          from 'react'
import { useParams }                    from 'next/navigation'
import { supabase }                     from '@/lib/supabase'
import { RefreshCw, ArrowLeft }         from 'lucide-react'
import Link                             from 'next/link'
import IntegracionStats                 from '@/components/integraciones/detalle/IntegracionStats'
import IntegracionConfiguracion         from '@/components/integraciones/detalle/IntegracionConfiguracion'

const STATS_CONFIG: Record<string, { label: string; value: string }[]> = {
  stripe: [
    { label: 'Transacciones Hoy', value: '184'    },
    { label: 'Volumen 24 hr',     value: '$284 K' },
    { label: 'Fallidos 24H',      value: '7'      },
    { label: 'Tasa Éxito',        value: '96.2%'  },
  ],
  fitpass: [
    { label: 'Check-ins hoy', value: '45'    },
    { label: 'Revenue',       value: '$209k' },
  ],
  inbody: [
    { label: 'Mediciones',   value: '342'         },
    { label: 'Dispositivos', value: '2'           },
    { label: 'Última Sync',  value: '5 min'       },
    { label: 'Sucursales',   value: 'Gym, Estudio'},
  ],
  'total-pass': [
    { label: 'Check-ins hoy', value: '37'    },
    { label: 'Revenue',       value: '$209k' },
  ],
}

export default function IntegracionDetallePage() {
  const { slug }  = useParams()
  const [integ,   setInteg]   = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const fetchInteg = async () => {
    const { data } = await supabase
      .from('integraciones').select('*')
      .eq('slug', slug).single()
    if (data) setInteg(data)
    setLoading(false)
  }

  useEffect(() => { fetchInteg() }, [slug])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
      <RefreshCw size={16} className="animate-spin" /> Cargando...
    </div>
  )

  if (!integ) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      Integración no encontrada
    </div>
  )

  const stats = STATS_CONFIG[slug as string] || []

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/dashboard/integraciones"
          className="flex items-center gap-1 hover:text-gray-700 transition">
          <ArrowLeft size={14} /> Integraciones
        </Link>
        <span>›</span>
        <span className="font-bold text-gray-700">{integ.nombre}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ backgroundColor: `${integ.logo_color}15` }}>
            {integ.logo_emoji}
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">{integ.nombre}</h1>
            <p className="text-sm text-gray-400">{integ.descripcion}</p>
          </div>
        </div>
        <Link href="/dashboard/integraciones"
          className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
          ✎ Editar integración
        </Link>
      </div>

      {/* Stats */}
      <IntegracionStats stats={stats} />

      {/* Configuración */}
      <IntegracionConfiguracion integ={integ} onRefresh={fetchInteg} />
    </div>
  )
}