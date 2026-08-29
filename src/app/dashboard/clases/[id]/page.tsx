'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Users, Clock, MapPin, UserCheck, UserX, CheckCircle2, XCircle } from 'lucide-react'
import Link from 'next/link'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Clase {
  id: string
  nombre_clase: string
  tipo_clase: string
  instructor: string
  horario: string
  capacidad_max: number
  salon: string
  estado: string
  descripcion: string
  coaches?: { nombre_completo: string; especialidad: string }
  staff?: { nombre: string; primer_apellido: string }
}

interface Reserva {
  id: string
  estatus: string
  created_at: string
  clientes: { id: string; nombre_completo: string; email: string }
}

interface Asistencia {
  id: string
  cliente_id: string
  fecha_checkin: string
}

const TIPO_COLORS: Record<string, string> = {
  Spinning:  'bg-orange-500/20 text-orange-400',
  Yoga:      'bg-purple-500/20 text-purple-400',
  Box:       'bg-red-500/20    text-red-400',
  Funcional: 'bg-blue-500/20   text-blue-400',
  General:   'bg-zinc-500/20   text-zinc-400',
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function DetalleClase() {
  const { id }   = useParams()
  const router   = useRouter()

  const [clase,       setClase]       = useState<Clase | null>(null)
  const [reservas,    setReservas]    = useState<Reserva[]>([])
  const [asistencias, setAsistencias] = useState<Asistencia[]>([])
  const [loading,     setLoading]     = useState(true)
  const [checkingIn,  setCheckingIn]  = useState<string | null>(null) // id del cliente procesando

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true)

    const [{ data: claseData }, { data: reservasData }, { data: asistenciasData }] = await Promise.all([
      supabase
        .from('clases')
        .select('*, staff(nombre, primer_apellido)')
        .eq('id', id)
        .single(),
      supabase
        .from('reservas')
        .select('*, clientes(id, nombre_completo, email)')
        .eq('clase_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('asistencias')
        .select('*')
        .eq('clase_id' , id) // filtramos por clase
    ])

    if (claseData)      setClase(claseData)
    if (reservasData)   setReservas(reservasData)
    if (asistenciasData) setAsistencias(asistenciasData)

    setLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  // ── Check-in ───────────────────────────────────────────────────────────────
  const handleCheckIn = async (clienteId: string) => {
    setCheckingIn(clienteId)

    // Verificar si ya hizo check-in
    const yaAsistio = asistencias.some(a => a.cliente_id === clienteId)
    if (yaAsistio) {
      setCheckingIn(null)
      return
    }

    const { error } = await supabase.from('asistencias').insert([{
      cliente_id:   clienteId,
      clase_id:     id,
      fecha_checkin: new Date().toISOString()
    }])

    if (error) {
      alert('Error en check-in: ' + error.message)
    } else {
      // Actualizar estatus de reserva a Confirmada
      await supabase
        .from('reservas')
        .update({ estatus: 'Confirmada' })
        .eq('clase_id', id)
        .eq('cliente_id', clienteId)

      fetchData()
    }
    setCheckingIn(null)
  }

  // ── Cancelar reserva ───────────────────────────────────────────────────────
  const handleCancelarReserva = async (reservaId: string) => {
    const { error } = await supabase
      .from('reservas')
      .update({ estatus: 'Cancelada' })
      .eq('id', reservaId)

    if (!error) fetchData()
  }

  // ── Cancelar clase completa ────────────────────────────────────────────────
  const handleCancelarClase = async () => {
    const { error } = await supabase
      .from('clases')
      .update({ estado: 'Cancelada' })
      .eq('id', id)

    if (!error) fetchData()
  }

  // ── Métricas ───────────────────────────────────────────────────────────────
  const totalReservas    = reservas.filter(r => r.estatus !== 'Cancelada').length
  const totalAsistencias = asistencias.length
  const noShows          = totalReservas - totalAsistencias
  const ocupacion        = clase ? Math.round((totalReservas / clase.capacidad_max) * 100) : 0

  if (loading) return <div className="p-10 text-zinc-500 italic">Cargando clase...</div>
  if (!clase)  return <div className="p-10 text-red-500">Clase no encontrada.</div>

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Back + Header */}
      <div>
        <Link href="/dashboard/clases" className="flex items-center gap-2 text-zinc-500 hover:text-white text-sm mb-4 transition w-fit">
          <ArrowLeft size={16} /> Volver a Clases
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-black italic uppercase tracking-tighter">{clase.nombre_clase}</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${TIPO_COLORS[clase.tipo_clase] || TIPO_COLORS['General']}`}>
                {clase.tipo_clase}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${clase.estado === 'Activa' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                {clase.estado}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-zinc-500 text-sm">
              <span className="flex items-center gap-1">
                <Clock size={14} />
                {new Date(clase.horario).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                {' · '}
                {new Date(clase.horario).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="flex items-center gap-1"><MapPin size={14} />{clase.salon}</span>
              <span className="flex items-center gap-1"><Users size={14} />Coach: {clase.staff ? `${clase.staff.nombre} ${clase.staff.primer_apellido}`.trim() : clase.instructor || '—'}</span>
            </div>
            {clase.descripcion && <p className="text-zinc-600 text-sm mt-2 max-w-xl">{clase.descripcion}</p>}
          </div>

          {clase.estado === 'Activa' && (
            <button
              onClick={handleCancelarClase}
              className="px-4 py-2 border border-red-800 text-red-500 hover:bg-red-500/10 rounded-xl text-sm font-bold transition whitespace-nowrap"
            >
              Cancelar Clase
            </button>
          )}
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Reservas</p>
          <p className="text-3xl font-black mt-1">{totalReservas}<span className="text-zinc-600 text-lg font-normal">/{clase.capacidad_max}</span></p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Asistencias</p>
          <p className="text-3xl font-black mt-1 text-green-500">{totalAsistencias}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">No-Shows</p>
          <p className="text-3xl font-black mt-1 text-red-500">{noShows < 0 ? 0 : noShows}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Ocupación</p>
          <p className="text-3xl font-black mt-1">{ocupacion}%</p>
          <div className="w-full bg-zinc-800 h-1.5 mt-2 rounded-full overflow-hidden">
            <div className="bg-white h-full transition-all" style={{ width: `${Math.min(ocupacion, 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Lista de reservas / asistencia */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="font-black uppercase tracking-tighter">Lista de Asistencia</h2>
          <span className="text-zinc-500 text-xs">{reservas.length} reservas en total</span>
        </div>

        <table className="w-full text-left">
          <thead className="bg-zinc-800 text-zinc-400 text-xs uppercase font-bold">
            <tr>
              <th className="p-4">Socio</th>
              <th className="p-4">Email</th>
              <th className="p-4">Reserva</th>
              <th className="p-4">Check-in</th>
              <th className="p-4">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {reservas.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-zinc-600 italic">
                  No hay reservas para esta clase
                </td>
              </tr>
            ) : reservas.map(r => {
              const hizoChekin = asistencias.some(a => a.cliente_id === r.clientes?.id)
              const cancelada  = r.estatus === 'Cancelada'

              return (
                <tr key={r.id} className={`transition ${cancelada ? 'opacity-40' : 'hover:bg-zinc-800/50'}`}>
                  <td className="p-4 font-medium">
                    <Link href={`/dashboard/clientes/${r.clientes?.id}`} className="hover:text-blue-400 transition">
                      {r.clientes?.nombre_completo}
                    </Link>
                  </td>
                  <td className="p-4 text-zinc-500 text-sm">{r.clientes?.email}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      r.estatus === 'Confirmada' ? 'bg-green-500/10 text-green-500' :
                      r.estatus === 'Cancelada'  ? 'bg-red-500/10 text-red-500' :
                      'bg-yellow-500/10 text-yellow-500'
                    }`}>
                      {r.estatus}
                    </span>
                  </td>
                  <td className="p-4">
                    {hizoChekin
                      ? <span className="flex items-center gap-1 text-green-500 text-xs font-bold"><CheckCircle2 size={14}/> Presente</span>
                      : <span className="flex items-center gap-1 text-zinc-600 text-xs"><XCircle size={14}/> Pendiente</span>
                    }
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {/* Check-in */}
                      {!cancelada && (
                        <button
                          onClick={() => handleCheckIn(r.clientes?.id)}
                          disabled={hizoChekin || checkingIn === r.clientes?.id}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                            hizoChekin
                              ? 'bg-green-500/10 text-green-600 cursor-default'
                              : 'bg-zinc-800 hover:bg-green-500/20 hover:text-green-400 text-zinc-400'
                          }`}
                        >
                          <UserCheck size={13} />
                          {checkingIn === r.clientes?.id ? '...' : hizoChekin ? 'Check-in hecho' : 'Check-in'}
                        </button>
                      )}
                      {/* Cancelar reserva */}
                      {!cancelada && !hizoChekin && (
                        <button
                          onClick={() => handleCancelarReserva(r.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-500 transition"
                        >
                          <UserX size={13} /> No-show
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}