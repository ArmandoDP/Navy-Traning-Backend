'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSucursal } from '@/context/SucursalContext'
import { Plus, ChevronLeft, ChevronRight, Filter, RefreshCw, Copy } from 'lucide-react'
import ModalCrearClase    from '@/components/DrawerCrearClase'
import ClasesListaView    from '@/components/clases/ClasesListaView'
import ClasesDiaView      from '@/components/clases/ClasesDiaView'
import ClasesSemanView    from '@/components/clases/ClasesSemanView'
import ClasesMesView      from '@/components/clases/ClasesMesView'
import DrawerDetalleClase from '@/components/clases/DrawerDetalleClase'
import DrawerCopiarSemana from '@/components/clases/DrawerCopiarSemana'

type Vista = 'dia' | 'semana' | 'mes' | 'lista'

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function getRangoLabel(vista: Vista, fecha: Date) {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
  if (vista === 'dia') return fecha.toLocaleDateString('es-MX', opts)
  if (vista === 'mes') return `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`
  if (vista === 'lista') return fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  // semana
  const lunes = new Date(fecha)
  const day   = lunes.getDay()
  lunes.setDate(lunes.getDate() - (day === 0 ? 6 : day - 1))
  const domingo = new Date(lunes)
  domingo.setDate(domingo.getDate() + 6)
  return `${lunes.getDate()} de ${MESES[lunes.getMonth()]} ${lunes.getFullYear()} – ${domingo.getDate()} de ${MESES[domingo.getMonth()]} ${domingo.getFullYear()}`
}

function navegar(vista: Vista, fecha: Date, dir: number): Date {
  const d = new Date(fecha)
  if (vista === 'dia' || vista === 'lista') d.setDate(d.getDate() + dir)
  if (vista === 'semana') d.setDate(d.getDate() + dir * 7)
  if (vista === 'mes')    d.setMonth(d.getMonth() + dir)
  return d
}

export default function ClasesPage() {
  const { sucursalId, sucursalActiva } = useSucursal()

  const [clases,     setClases]     = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [vista,      setVista]      = useState<Vista>('lista')
  const [fecha,      setFecha]      = useState(new Date())
  const [modalOpen,  setModalOpen]  = useState(false)
  const [claseActivaId, setClaseActivaId] = useState<string | null>(null)
  const [drawerCopiar, setDrawerCopiar] = useState(false)

  const fetchClases = async () => {
    setLoading(true)
    let q = supabase
      .from('clases')
      .select('*, estado_actual, wellhub_slot_id, totalpass_occurrence_uuid, publicar_wellhub, staff(nombre, primer_apellido), reservas(id, estatus), rooms(nombre, capacidad)')
      .order('horario')
    if (sucursalId) q = q.eq('sucursal_id', sucursalId)
    const { data, error } = await q
    if (!error && data) setClases(data)
    setLoading(false)
  }

  useEffect(() => { fetchClases() }, [sucursalId])

  // Métricas rápidas
  const totalClases    = clases.length
  const clasesActivas  = clases.filter(c => c.estado === 'Activa').length
  const totalReservas  = clases.reduce((a, c) => a + (c.reservas?.filter((r: any) => r.estatus !== 'Cancelada').length || 0), 0)
  const ocupacionProm  = clases.length > 0
    ? Math.round(clases.reduce((a, c) => {
        const res = c.reservas?.filter((r: any) => r.estatus !== 'Cancelada').length || 0
        return a + (c.capacidad_max > 0 ? res / c.capacidad_max : 0)
      }, 0) / clases.length * 100)
    : 0

  // Colores por tipo para los dots del subheader
  const TIPO_COLORS: Record<string, string> = {
    Hybrid: '#3b82f6', Hyrox: '#22c55e', Spinning: '#f97316',
    Yoga: '#8b5cf6', Box: '#ef4444', Funcional: '#6366f1',
  }
  const tiposUnicos = [...new Set(clases.map(c => c.tipo_display || c.tipo_clase).filter(Boolean))] as string[]

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
      <RefreshCw size={16} className="animate-spin"/> Cargando clases...
    </div>
  )

  return (
    <div className="space-y-4">

      {/* ── Header principal ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Clases</h1>
          <p className="text-gray-400 text-sm mt-0.5">Gestión de horarios y clases</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Selector sucursal inline */}
          <div className="flex items-center gap-2 border border-gray-200 bg-white rounded-xl px-3 py-2 text-sm text-gray-700">
            <span className="text-gray-400">📍</span>
            <span className="font-medium">{sucursalActiva?.nombre || 'Global'}</span>
            <span className="text-gray-400 text-xs">▾</span>
          </div>

          {/* Tabs vista */}
          <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1 gap-0.5">
            {(['dia','semana','mes','lista'] as Vista[]).map(v => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition capitalize ${
                  vista === v ? 'bg-gray-900 text-white font-bold' : 'text-gray-500 hover:text-gray-800'
                }`}>
                {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : v === 'mes' ? 'Mes' : 'Lista'}
              </button>
            ))}
          </div>

          <button className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition text-gray-500">
            <Filter size={16}/>
          </button>

          {/* Botón en el header — solo si hay sucursal seleccionada */}
          {sucursalId && (
            <button onClick={() => setDrawerCopiar(true)}
              className="flex items-center gap-2 border border-gray-200 bg-white text-gray-700 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-gray-50 transition">
              <Copy size={15}/> Copiar semana
            </button>
          )}

          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition">
            <Plus size={16}/> Nueva clase
          </button>
        </div>
      </div>

      {/* ── Métricas rápidas ── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Clases',   val: totalClases,           color: 'text-gray-900'   },
          { label: 'Activas',        val: clasesActivas,         color: 'text-green-600'  },
          { label: 'Total Reservas', val: totalReservas,         color: 'text-indigo-600' },
          { label: 'Ocupación Prom', val: `${ocupacionProm}%`,  color: 'text-blue-600'   },
        ].map(m => (
          <div key={m.label} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{m.label}</p>
            <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.val}</p>
          </div>
        ))}
      </div>

      {/* ── Sub-header con nombre + dots + navegación ── */}
      <div className="bg-white border border-gray-200 rounded-2xl px-5 py-3.5 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Dot de sucursal */}
          {sucursalActiva && (
            <span className="flex items-center gap-1.5 font-bold text-gray-800">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              Clases {sucursalActiva.nombre}
            </span>
          )}
          {!sucursalActiva && (
            <span className="font-bold text-gray-800">Todas las clases</span>
          )}
          {/* Dots por tipo */}
          <div className="flex items-center gap-2 ml-2">
            {tiposUnicos.slice(0, 5).map(t => (
              <span key={t} className="flex items-center gap-1 text-xs font-medium border border-gray-200 rounded-full px-2 py-0.5"
                style={{ color: TIPO_COLORS[t] || '#9ca3af' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: TIPO_COLORS[t] || '#9ca3af' }} />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Navegación fecha */}
        <div className="flex items-center gap-2">
          <button onClick={() => setFecha(d => navegar(vista, d, -1))}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-400">
            <ChevronLeft size={16}/>
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[220px] text-center">
            {getRangoLabel(vista, fecha)}
          </span>
          <button onClick={() => setFecha(d => navegar(vista, d, 1))}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-400">
            <ChevronRight size={16}/>
          </button>
        </div>
      </div>

      {/* ── Vistas ── */}
      {vista === 'lista'  && <ClasesListaView  clases={clases} fechaActiva={fecha} onVerClase={id => setClaseActivaId(id)} />}
      {vista === 'dia'    && <ClasesDiaView    clases={clases} fechaActiva={fecha} />}
      {vista === 'semana' && <ClasesSemanView  clases={clases} fechaActiva={fecha} />}
      {vista === 'mes'    && (
        <ClasesMesView
          clases={clases}
          fechaActiva={fecha}
          onDiaClick={d => { setFecha(d); setVista('lista') }}
        />
      )}

      <ModalCrearClase
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchClases}
        sucursalId={sucursalId || undefined}
      />

      <DrawerDetalleClase
        isOpen={!!claseActivaId}
        claseId={claseActivaId}
        onClose={() => setClaseActivaId(null)}
        onSuccess={fetchClases}
      />

      {sucursalId && (
        <DrawerCopiarSemana
          isOpen={drawerCopiar}
          onClose={() => setDrawerCopiar(false)}
          onSuccess={() => { fetchClases(); setDrawerCopiar(false) }}
          fechaActiva={fecha}
          sucursalId={sucursalId}
          sucursalNombre={sucursalActiva?.nombre || ''}
        />
      )}
    </div>
  )
}