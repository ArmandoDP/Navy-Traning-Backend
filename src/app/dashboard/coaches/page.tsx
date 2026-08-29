'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSucursal } from '@/context/SucursalContext'
import Link from 'next/link'
import { Plus, ChevronLeft, ChevronRight, Calendar, List, Clock, Users, MapPin } from 'lucide-react'
import ModalCrearClase from '@/components/DrawerCrearClase'

interface Clase {
  id: string; nombre_clase: string; instructor: string; horario: string
  capacidad_max: number; tipo_clase: string; salon: string; estado: string
  coach_id: string | null; staff?: { nombre: string; primer_apellido: string }
}

const DIAS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const TIPO_COLORS: Record<string, string> = {
  Spinning:  'bg-orange-100 text-orange-600 border-orange-200',
  Yoga:      'bg-purple-100 text-purple-600 border-purple-200',
  Box:       'bg-red-100    text-red-600    border-red-200',
  Funcional: 'bg-blue-100   text-blue-600   border-blue-200',
  General:   'bg-gray-100   text-gray-600   border-gray-200',
}

export default function ClasesPage() {
  const { sucursalId, sucursalActiva } = useSucursal()

  const [clases,       setClases]      = useState<Clase[]>([])
  const [loading,      setLoading]     = useState(true)
  const [vista,        setVista]       = useState<'lista'|'calendario'>('lista')
  const [modalOpen,    setModalOpen]   = useState(false)
  const [filtroTipo,   setFiltroTipo]  = useState('Todos')
  const [filtroEstado, setFiltroEstado]= useState('Todos')

  const hoy = new Date()
  const [mes,  setMes]  = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())

  const fetchClases = async () => {
    setLoading(true)
    let q = supabase.from('clases').select('*, staff(nombre, primer_apellido)').order('horario')
    if (sucursalId) q = q.eq('sucursal_id', sucursalId)
    const { data, error } = await q
    if (!error && data) setClases(data)
    setLoading(false)
  }

  useEffect(() => { fetchClases() }, [sucursalId])

  const tiposUnicos = ['Todos', ...Array.from(new Set(clases.map(c => c.tipo_clase).filter(Boolean)))]
  const filtradas   = clases.filter(c => {
    const t = filtroTipo   === 'Todos' || c.tipo_clase === filtroTipo
    const e = filtroEstado === 'Todos' || c.estado     === filtroEstado
    return t && e
  })

  // Calendario
  const primerDia = new Date(anio, mes, 1).getDay()
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const celdas    = Array.from({ length: primerDia + diasEnMes }, (_, i) => i < primerDia ? null : i - primerDia + 1)
  const clasesDia = (dia: number) => clases.filter(c => {
    const f = new Date(c.horario)
    return f.getFullYear() === anio && f.getMonth() === mes && f.getDate() === dia
  })
  const navMes = (dir: number) => {
    const d = new Date(anio, mes + dir, 1)
    setMes(d.getMonth()); setAnio(d.getFullYear())
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm italic">Cargando clases...</div>

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Clases</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {sucursalActiva ? `${sucursalActiva.nombre}, ${sucursalActiva.ciudad}` : 'Todas las sucursales'}
            {' · '}{clases.length} clases
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white border border-gray-200 rounded-xl p-1">
            <button onClick={() => setVista('lista')}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition ${vista === 'lista' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
              <List size={14}/> Lista
            </button>
            <button onClick={() => setVista('calendario')}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition ${vista === 'calendario' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
              <Calendar size={14}/> Calendario
            </button>
          </div>
          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition">
            <Plus size={16}/> Nueva Clase
          </button>
        </div>
      </div>

      {/* Filtros */}
      {vista === 'lista' && (
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-2 items-center">
            <span className="text-gray-400 text-xs uppercase font-bold">Tipo:</span>
            {tiposUnicos.map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition ${filtroTipo === t ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500 hover:border-gray-400 bg-white'}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-gray-400 text-xs uppercase font-bold">Estado:</span>
            {['Todos','Activa','Cancelada'].map(e => (
              <button key={e} onClick={() => setFiltroEstado(e)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition ${filtroEstado === e ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500 hover:border-gray-400 bg-white'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Vista Lista */}
      {vista === 'lista' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-400 text-xs uppercase font-bold">
              <tr>
                <th className="px-5 py-3">Clase</th>
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3">Coach</th>
                <th className="px-5 py-3">Horario</th>
                <th className="px-5 py-3">Salón</th>
                <th className="px-5 py-3">Cap.</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtradas.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-400 italic text-sm">No hay clases</td></tr>
              ) : filtradas.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-3 font-bold text-gray-900">{c.nombre_clase}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${TIPO_COLORS[c.tipo_clase] || TIPO_COLORS['General']}`}>
                      {c.tipo_clase || 'General'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-sm">{c.staff ? `${c.staff.nombre} ${c.staff.primer_apellido}`.trim() : c.instructor || '—'}</td>
                  <td className="px-5 py-3 text-gray-500 text-sm">
                    <div className="flex items-center gap-1">
                      <Clock size={12}/>
                      {new Date(c.horario).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {' '}{new Date(c.horario).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-sm">
                    <div className="flex items-center gap-1"><MapPin size={12}/>{c.salon || '—'}</div>
                  </td>
                  <td className="px-5 py-3 text-sm">
                    <div className="flex items-center gap-1"><Users size={12}/>{c.capacidad_max}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c.estado === 'Activa' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                      {c.estado || 'Activa'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/dashboard/clases/${c.id}`}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Vista Calendario */}
      {vista === 'calendario' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <button onClick={() => navMes(-1)} className="p-2 hover:bg-gray-100 rounded-xl transition"><ChevronLeft size={18}/></button>
            <h2 className="font-black text-gray-900">{MESES[mes]} {anio}</h2>
            <button onClick={() => navMes(1)}  className="p-2 hover:bg-gray-100 rounded-xl transition"><ChevronRight size={18}/></button>
          </div>
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DIAS.map(d => <div key={d} className="p-3 text-center text-xs font-bold text-gray-400 uppercase">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {celdas.map((dia, i) => {
              const esHoy = dia === hoy.getDate() && mes === hoy.getMonth() && anio === hoy.getFullYear()
              const cls   = dia ? clasesDia(dia) : []
              return (
                <div key={i} className={`min-h-[90px] p-2 border-b border-r border-gray-100 ${!dia ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                  {dia && (
                    <>
                      <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${esHoy ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}>
                        {dia}
                      </span>
                      <div className="space-y-0.5">
                        {cls.slice(0, 2).map(c => (
                          <Link key={c.id} href={`/dashboard/clases/${c.id}`}
                            className={`block text-[10px] font-bold px-1 py-0.5 rounded border truncate hover:opacity-80 ${TIPO_COLORS[c.tipo_clase] || TIPO_COLORS['General']}`}>
                            {new Date(c.horario).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} {c.nombre_clase}
                          </Link>
                        ))}
                        {cls.length > 2 && <span className="text-[10px] text-gray-400">+{cls.length - 2} más</span>}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <ModalCrearClase isOpen={modalOpen} onClose={() => setModalOpen(false)} onSuccess={fetchClases} sucursalId={sucursalId || undefined} />
    </div>
  )
}