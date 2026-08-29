'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail, Phone, CalendarDays, Users, TrendingUp, CheckCircle2 } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Coach {
  id: string
  nombre_completo: string
  email: string
  telefono: string
  especialidad: string
  estatus: string
  foto_url: string
  created_at: string
}

interface Clase {
  id: string
  nombre_clase: string
  tipo_clase: string
  horario: string
  capacidad_max: number
  salon: string
  estado: string
  total_reservas?: number
  total_asistencias?: number
}

const TIPO_COLORS: Record<string, string> = {
  Spinning:  'bg-orange-500/20 text-orange-400',
  Yoga:      'bg-purple-500/20 text-purple-400',
  Box:       'bg-red-500/20 text-red-400',
  Funcional: 'bg-blue-500/20 text-blue-400',
  General:   'bg-zinc-500/20 text-zinc-400',
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function PerfilCoach() {
  const { id } = useParams()

  const [coach,   setCoach]   = useState<Coach | null>(null)
  const [clases,  setClases]  = useState<Clase[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(false)
  const [formData, setFormData] = useState({ nombre_completo: '', email: '', telefono: '', especialidad: '', estatus: '' })
  const [saving, setSaving] = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true)

    const { data: coachData } = await supabase
      .from('coaches')
      .select('*')
      .eq('id', id)
      .single()

    if (coachData) {
      setCoach(coachData)
      setFormData({
        nombre_completo: coachData.nombre_completo,
        email:           coachData.email || '',
        telefono:        coachData.telefono || '',
        especialidad:    coachData.especialidad || '',
        estatus:         coachData.estatus || 'Activo',
      })
    }

    // Clases del coach con conteo de reservas y asistencias
    const { data: clasesData } = await supabase
      .from('clases')
      .select('*, reservas(id), asistencias(id)')
      .eq('coach_id', id)
      .order('horario', { ascending: false })

    if (clasesData) {
      const mapped = clasesData.map((c: any) => ({
        ...c,
        total_reservas:   c.reservas?.filter((r: any) => r.estatus !== 'Cancelada').length || 0,
        total_asistencias: c.asistencias?.length || 0,
      }))
      setClases(mapped)
    }

    setLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  // ── Guardar edición ────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('coaches')
      .update(formData)
      .eq('id', id)

    if (error) {
      alert('Error al actualizar: ' + error.message)
    } else {
      setEditando(false)
      fetchData()
    }
    setSaving(false)
  }

  // ── Métricas ───────────────────────────────────────────────────────────────
  const totalClases      = clases.length
  const clasesActivas    = clases.filter(c => c.estado === 'Activa').length
  const totalAsistencias = clases.reduce((a, c) => a + (c.total_asistencias || 0), 0)
  const promedioOcupacion = clases.length > 0
    ? Math.round(clases.reduce((a, c) => a + ((c.total_reservas || 0) / c.capacidad_max) * 100, 0) / clases.length)
    : 0
  const antiguedad = coach
    ? Math.floor((new Date().getTime() - new Date(coach.created_at).getTime()) / (1000 * 3600 * 24))
    : 0

  if (loading) return <div className="p-10 text-zinc-500 italic">Cargando perfil del coach...</div>
  if (!coach)  return <div className="p-10 text-red-500">Coach no encontrado.</div>

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* Back */}
      <Link href="/dashboard/coaches" className="flex items-center gap-2 text-zinc-500 hover:text-white text-sm transition w-fit">
        <ArrowLeft size={16} /> Volver a Coaches
      </Link>

      {/* Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          {/* Avatar + info */}
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center text-2xl font-black text-white flex-shrink-0">
              {coach.foto_url
                ? <img src={coach.foto_url} alt={coach.nombre_completo} className="w-full h-full rounded-2xl object-cover" />
                : coach.nombre_completo.charAt(0).toUpperCase()
              }
            </div>
            <div>
              {editando ? (
                <input
                  className="bg-black border border-zinc-700 rounded-xl px-3 py-1.5 text-white font-black text-xl outline-none focus:border-white w-full"
                  value={formData.nombre_completo}
                  onChange={e => setFormData(p => ({ ...p, nombre_completo: e.target.value }))}
                />
              ) : (
                <h1 className="text-2xl font-black italic uppercase tracking-tighter">{coach.nombre_completo}</h1>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${TIPO_COLORS[coach.especialidad] || 'bg-zinc-700 text-zinc-400'}`}>
                  {coach.especialidad || 'Sin especialidad'}
                </span>
                <span className={`text-xs font-bold ${coach.estatus === 'Activo' ? 'text-green-500' : 'text-zinc-500'}`}>
                  {coach.estatus}
                </span>
                <span className="text-zinc-600 text-xs">{antiguedad} días en Navy</span>
              </div>
            </div>
          </div>

          {/* Botones edición */}
          <div className="flex gap-2">
            {editando ? (
              <>
                <button
                  onClick={() => setEditando(false)}
                  className="px-4 py-2 border border-zinc-700 text-zinc-400 rounded-xl text-sm font-bold hover:bg-zinc-800 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-white text-black rounded-xl text-sm font-black hover:bg-zinc-200 disabled:opacity-50 transition"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditando(true)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-bold transition"
              >
                Editar Perfil
              </button>
            )}
          </div>
        </div>

        {/* Campos editables */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-zinc-800">
          {/* Email */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1"><Mail size={10}/> Email</p>
            {editando ? (
              <input type="email" className="w-full bg-black border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-white"
                value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} />
            ) : (
              <p className="text-sm text-zinc-300">{coach.email || '—'}</p>
            )}
          </div>
          {/* Teléfono */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1"><Phone size={10}/> Teléfono</p>
            {editando ? (
              <input className="w-full bg-black border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-white"
                value={formData.telefono} onChange={e => setFormData(p => ({ ...p, telefono: e.target.value }))} />
            ) : (
              <p className="text-sm text-zinc-300">{coach.telefono || '—'}</p>
            )}
          </div>
          {/* Especialidad */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-zinc-500 uppercase">Especialidad</p>
            {editando ? (
              <select className="w-full bg-black border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none appearance-none"
                value={formData.especialidad} onChange={e => setFormData(p => ({ ...p, especialidad: e.target.value }))}>
                {['Spinning','Yoga','Box','Funcional','General'].map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            ) : (
              <p className="text-sm text-zinc-300">{coach.especialidad || '—'}</p>
            )}
          </div>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"><CalendarDays size={10}/> Total Clases</p>
          <p className="text-3xl font-black mt-1">{totalClases}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"><CheckCircle2 size={10}/> Clases Activas</p>
          <p className="text-3xl font-black mt-1 text-green-500">{clasesActivas}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"><Users size={10}/> Asistencias</p>
          <p className="text-3xl font-black mt-1">{totalAsistencias}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"><TrendingUp size={10}/> Ocupación Prom.</p>
          <p className="text-3xl font-black mt-1">{promedioOcupacion}%</p>
          <div className="w-full bg-zinc-800 h-1.5 mt-2 rounded-full overflow-hidden">
            <div className="bg-white h-full transition-all" style={{ width: `${Math.min(promedioOcupacion, 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Historial de clases */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="font-black uppercase tracking-tighter">Historial de Clases</h2>
          <span className="text-zinc-500 text-xs">{totalClases} clases en total</span>
        </div>

        <table className="w-full text-left">
          <thead className="bg-zinc-800 text-zinc-400 text-xs uppercase font-bold">
            <tr>
              <th className="p-4">Clase</th>
              <th className="p-4">Tipo</th>
              <th className="p-4">Fecha</th>
              <th className="p-4">Salón</th>
              <th className="p-4">Asistencias</th>
              <th className="p-4">Estado</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {clases.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-600 italic">
                  Este coach aún no tiene clases asignadas
                </td>
              </tr>
            ) : clases.map(c => (
              <tr key={c.id} className="hover:bg-zinc-800/50 transition">
                <td className="p-4 font-medium">{c.nombre_clase}</td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${TIPO_COLORS[c.tipo_clase] || TIPO_COLORS['General']}`}>
                    {c.tipo_clase}
                  </span>
                </td>
                <td className="p-4 text-zinc-400 text-sm">
                  {new Date(c.horario).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' '}
                  {new Date(c.horario).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="p-4 text-zinc-400 text-sm">{c.salon}</td>
                <td className="p-4 text-sm">
                  <span className="text-green-500 font-bold">{c.total_asistencias}</span>
                  <span className="text-zinc-600">/{c.capacidad_max}</span>
                </td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c.estado === 'Activa' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                    {c.estado}
                  </span>
                </td>
                <td className="p-4">
                  <Link
                    href={`/dashboard/clases/${c.id}`}
                    className="text-xs text-zinc-500 hover:text-white transition font-bold"
                  >
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}