'use client'
import { useState, useEffect } from 'react'
import { X, Mail, MessageSquare, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import StaffTabMetricas    from './StaffTabMetricas'
import StaffTabInfoGeneral from './StaffTabInfoGeneral'
import StaffTabClases      from './StaffTabClases'
import StaffTabPerformance from './StaffTabPerformance'
import StaffTabNomina      from './StaffTabNomina'
import StaffTabHoras       from './StaffTabHoras'
import StaffTabAcceso from '../StaffTabAcceso'

interface Props {
  staffId: string | null
  isOpen:  boolean
  onClose: () => void
  onEditar:(empleado: any) => void
}

const NIVEL_CONFIG: Record<string, { dot: string }> = {
  'Lead':        { dot: '#9ca3af' },
  'Junior':      { dot: '#9ca3af' },
  'Marine':      { dot: '#06b6d4' },
  'Semi-senior': { dot: '#3b82f6' },
  'Senior':      { dot: '#22c55e' },
  'Elite':       { dot: '#f59e0b' },
}

export default function DrawerStaff({ staffId, isOpen, onClose, onEditar }: Props) {
  const [empleado,  setEmpleado]  = useState<any>(null)
  const [loading,   setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState('metricas')
  const [showAcciones, setShowAcciones] = useState(false)
  const [loadingAccion, setLoadingAccion] = useState(false)
  const [popup, setPopup] = useState<{ tipo: 'error'|'exito'; mensaje: string } | null>(null)

  const isCoach = empleado?.tipo === 'Coach'

  const TABS = [
    { key: 'metricas',  label: 'Métricas',     icon: '📊' },
    { key: 'info',      label: 'Info general', icon: '👤' },
    ...(isCoach ? [
      { key: 'clases',      label: 'Clases',      icon: '📅' },
      { key: 'performance', label: 'Performance', icon: '📈' },
      { key: 'nomina',      label: 'Nómina',      icon: '💰' },
      { key: 'horas',       label: 'Horas',       icon: '⏱' },
    ] : [
      { key: 'nomina', label: 'Nómina', icon: '💰' },
      { key: 'horas',  label: 'Horas',  icon: '⏱' },
    ]),
    { key: 'acceso', label: 'Acceso CRM', icon: '🔐' },  // ← fuera del spread
  ]

  const fetchEmpleado = async () => {
    if (!staffId) return
    setLoading(true)
    const { data } = await supabase
      .from('staff')
      .select(`
        *,
        staff_sucursales(sucursales(id, nombre, color)),
        staff_categorias(categoria),
        staff_reglas_bono(*),
        staff_documentos(*)
      `)
      .eq('id', staffId)
      .single()
    if (data) setEmpleado(data)
    setLoading(false)
  }

  const handleCambiarEstatus = async () => {
    setLoadingAccion(true)
    const nuevoEstatus = empleado.estatus === 'Activo' ? 'Inactivo' : 'Activo'
    await supabase.from('staff').update({ estatus: nuevoEstatus }).eq('id', empleado.id)
    await fetchEmpleado()
    setShowAcciones(false)
    setLoadingAccion(false)
  }

  const handleEliminar = async () => {
    setLoadingAccion(true)
    await supabase.from('staff_sucursales').delete().eq('staff_id', empleado.id)
    await supabase.from('staff_categorias').delete().eq('staff_id', empleado.id)
    await supabase.from('staff_documentos').delete().eq('staff_id', empleado.id)
    await supabase.from('staff').delete().eq('id', empleado.id)
    setLoadingAccion(false)
    onClose()
  }
  useEffect(() => {
    if (isOpen && staffId) { fetchEmpleado(); setActiveTab('metricas') }
  }, [isOpen, staffId])

  const antiguedad = (fecha: string) => {
    if (!fecha) return '—'
    const años = Math.floor((Date.now() - new Date(fecha).getTime()) / (1000 * 3600 * 24 * 365))
    if (años === 0) {
      const meses = Math.floor((Date.now() - new Date(fecha).getTime()) / (1000 * 3600 * 24 * 30))
      return `${meses} ${meses === 1 ? 'mes' : 'meses'}`
    }
    return `${años} ${años === 1 ? 'año' : 'años'}`
  }

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />

      {/* Drawer */}
      <div className="fixed top-0 right-0 z-50 h-full bg-white shadow-2xl flex flex-col"
        style={{ width: '580px' }}>

        {loading || !empleado ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Cargando...
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-black text-gray-900">
                        {empleado.nombre} {empleado.primer_apellido}
                      </h2>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        empleado.estatus === 'Activo'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-red-50 text-red-500'
                      }`}>
                        {empleado.estatus}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-400">{empleado.email}</p>
                      {empleado.telefono && (
                        <>
                          <span className="text-gray-200">·</span>
                          <p className="text-xs text-gray-400">{empleado.telefono}</p>
                        </>
                      )}
                    </div>
                    {/* Badge tipo */}
                    <div className="mt-2">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg"
                        style={{
                          color: '#6366f1',
                          backgroundColor: 'rgba(99,102,241,0.1)'
                        }}>
                        {empleado.tipo}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {popup && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-black/20">
                      <div className="bg-white rounded-2xl shadow-2xl border border-red-100 px-6 py-5 w-full flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-xl">⚠️</div>
                          <div>
                            <p className="text-sm font-black text-gray-900">¿Eliminar empleado?</p>
                            <p className="text-xs text-gray-500 mt-0.5">Esta acción no se puede deshacer.</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setPopup(null)}
                            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
                            Cancelar
                          </button>
                          <button onClick={handleEliminar} disabled={loadingAccion}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition disabled:opacity-40">
                            {loadingAccion ? 'Eliminando...' : 'Sí, eliminar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Botón más acciones */}
                  <div className="relative">
                    <button
                      onClick={() => setShowAcciones(p => !p)}
                      className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50 transition">
                      ⋯ Más acciones
                    </button>

                    {showAcciones && (
                      <>
                        <div onClick={() => setShowAcciones(false)} className="fixed inset-0 z-10" />
                        <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[210px]">
                          <button
                            onClick={() => { onEditar(empleado); setShowAcciones(false) }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition text-left">
                            ✏️ Editar empleado
                          </button>
                          <button
                            onClick={handleCambiarEstatus}
                            disabled={loadingAccion}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition text-left">
                            {empleado.estatus === 'Activo' ? '🔴 Marcar como Inactivo' : '🟢 Marcar como Activo'}
                          </button>
                          <div className="border-t border-gray-100 my-1" />
                          <button
                            onClick={() => { setPopup({ tipo: 'error', mensaje: '' }); setShowAcciones(false) }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 transition text-left">
                            🗑 Eliminar empleado
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <button onClick={onClose}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition">
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Stats rápidos */}
              <div className="grid grid-cols-4 gap-4 mt-3">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Sucursales</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {empleado.staff_sucursales?.length > 0
                      ? empleado.staff_sucursales.map((ss: any, i: number) => {
                          const color = ss.sucursales?.color || '#6b7280'
                          const r = parseInt(color.slice(1,3),16)
                          const g = parseInt(color.slice(3,5),16)
                          const b = parseInt(color.slice(5,7),16)
                          return (
                            <span key={i}
                              className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                              style={{ color, backgroundColor: `rgba(${r},${g},${b},0.12)` }}>
                              {ss.sucursales?.nombre}
                            </span>
                          )
                        })
                      : <span className="text-xs text-gray-300">—</span>
                    }
                  </div>
                </div>
                {isCoach && (
                  <>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Nivel</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        {empleado.nivel
                          ? <>
                              <span className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: NIVEL_CONFIG[empleado.nivel]?.dot || '#9ca3af' }} />
                              <span className="text-xs font-semibold text-gray-700">{empleado.nivel}</span>
                            </>
                          : <span className="text-xs text-gray-300">—</span>
                        }
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Clases</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {empleado.staff_categorias?.slice(0,2).map((sc: any, i: number) => (
                          <span key={i}
                            className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">
                            + {sc.categoria}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Antigüedad</p>
                  <p className="text-xs font-semibold text-gray-700 mt-1">
                    {antiguedad(empleado.fecha_ingreso)}
                  </p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 overflow-x-auto">
              {TABS.map(tab => (
                <button key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition ${
                    activeTab === tab.key
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}>
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Contenido del tab */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'metricas'      && <StaffTabMetricas     empleado={empleado} />}
              {activeTab === 'info'          && <StaffTabInfoGeneral  empleado={empleado} onRefresh={fetchEmpleado} />}
              {activeTab === 'clases'        && isCoach && <StaffTabClases      empleado={empleado} />}
              {activeTab === 'performance'   && isCoach && <StaffTabPerformance empleado={empleado} />}
              {activeTab === 'nomina'        && <StaffTabNomina       empleado={empleado} />}
              {activeTab === 'horas'         && <StaffTabHoras        empleado={empleado} />}
              {activeTab === 'acceso' && <StaffTabAcceso empleado={empleado} onRefresh={fetchEmpleado} />}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 px-6 py-3 border-t border-gray-100">
              <button className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition">
                <Mail size={13} /> Email
              </button>
              <button className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition">
                <MessageSquare size={13} /> SMS
              </button>
              {isCoach && (
                <button className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition ml-auto">
                  <Plus size={13} /> Asignar clase
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}