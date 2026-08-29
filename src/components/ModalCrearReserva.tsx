'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Search, Check, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Cliente {
  id: string; nombre_completo: string; email: string
  telefono?: string; plan?: string; nombre_plan?: string
  clases_restantes?: number; estatus?: string
}
interface Clase {
  id: string; nombre_clase: string; horario: string
  capacidad_max: number; tipo_clase: string; salon: string
  sucursal_id?: string; total_reservas?: number
  staff?: { nombre: string; primer_apellido: string }
  sucursales?: { id: string; nombre: string; color: string }
}
interface Spot {
  id: string; numero: number; estatus: string; cliente_id?: string
}
interface Sucursal { id: string; nombre: string; color: string }

interface Props { isOpen: boolean; onClose: () => void; onSuccess: () => void }

const HORARIO_FILTERS = ['Cualquiera', 'Mañana', 'Tarde', 'Noche']

function getHorarioLabel(hora: number) {
  if (hora >= 6  && hora < 12) return 'Mañana'
  if (hora >= 12 && hora < 18) return 'Tarde'
  if (hora >= 18)               return 'Noche'
  return 'Mañana'
}

// ─── Barra de progreso ────────────────────────────────────────────────────────
function ProgressBar({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex gap-1 px-6 py-2">
      {[1, 2, 3].map(s => (
        <div key={s} className={`h-0.5 flex-1 rounded-full transition-all ${s <= step ? 'bg-gray-900' : 'bg-gray-200'}`} />
      ))}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ModalCrearReserva({ isOpen, onClose, onSuccess }: Props) {
  const [step,     setStep]     = useState<1|2|3>(1)
  const [loading,  setLoading]  = useState(false)

  // Data
  const [clientes,   setClientes]   = useState<Cliente[]>([])
  const [clases,     setClases]     = useState<Clase[]>([])
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [spots,      setSpots]      = useState<Spot[]>([])

  // Selecciones
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [claseSeleccionada,   setClaseSeleccionada]   = useState<Clase | null>(null)
  const [spotSeleccionado,    setSpotSeleccionado]    = useState<number | null>(null)

  // Filtros paso 2
  const [busCliente,     setBusCliente]     = useState('')
  const [sucursalFiltro, setSucursalFiltro] = useState('Todas')
  const [fechaActiva,    setFechaActiva]    = useState(new Date())
  const [horarioFiltro,  setHorarioFiltro]  = useState('Cualquiera')
  const [yaReservado,    setYaReservado]    = useState(false)

  // ── Fetch inicial ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    Promise.all([
      supabase.from('clientes').select('id, nombre_completo, email, telefono, plan, nombre_plan, clases_restantes, estatus')
        .eq('estatus', 'Activo').order('nombre_completo'),
      supabase.from('clases').select('*, staff(nombre, primer_apellido), reservas(id, estatus), sucursales(id, nombre, color)')
        .eq('estado', 'Activa').gte('horario', new Date().toISOString()).order('horario'),
      supabase.from('sucursales').select('id, nombre, color').eq('estatus', 'Activa').order('nombre'),
    ]).then(([{ data: clis }, { data: cls }, { data: sucs }]) => {
      if (clis) setClientes(clis)
      if (cls)  setClases(cls.map((c: any) => ({
        ...c,
        total_reservas: c.reservas?.filter((r: any) => r.estatus !== 'Cancelada').length || 0,
      })))
      if (sucs) setSucursales(sucs)
    })
  }, [isOpen])

  // ── Cargar spots cuando se selecciona clase ───────────────────────────────────
  useEffect(() => {
    if (!claseSeleccionada) { setSpots([]); return }
    const cargarSpots = async () => {
      const { data } = await supabase.from('spots').select('*').eq('clase_id', claseSeleccionada.id)
      // Generar spots del 1 al capacidad_max si no existen
      const spotsExistentes = data || []
      const todosSpots = Array.from({ length: claseSeleccionada.capacidad_max }, (_, i) => {
        const existe = spotsExistentes.find((s: Spot) => s.numero === i + 1)
        return existe || { id: `virtual-${i+1}`, numero: i + 1, estatus: 'disponible', cliente_id: null }
      })
      setSpots(todosSpots)
    }
    cargarSpots()
  }, [claseSeleccionada])

  // ── Ya reservado ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clienteSeleccionado || !claseSeleccionada) { setYaReservado(false); return }
    supabase.from('reservas').select('id')
      .eq('cliente_id', clienteSeleccionado.id).eq('clase_id', claseSeleccionada.id).neq('estatus', 'Cancelada').limit(1)
      .then(({ data }) => setYaReservado((data?.length || 0) > 0))
  }, [clienteSeleccionado, claseSeleccionada])

  // ── Reset ─────────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setStep(1); setBusCliente(''); setClienteSeleccionado(null)
    setClaseSeleccionada(null); setSpotSeleccionado(null)
    setSucursalFiltro('Todas'); setFechaActiva(new Date())
    setHorarioFiltro('Cualquiera'); setYaReservado(false)
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!clienteSeleccionado || !claseSeleccionada) return
    setLoading(true)

    const llena = (claseSeleccionada.total_reservas || 0) >= claseSeleccionada.capacidad_max

    const { data: reserva, error } = await supabase.from('reservas').insert([{
      cliente_id:   clienteSeleccionado.id,
      clase_id:     claseSeleccionada.id,
      estatus:      'Pendiente',
      lista_espera: llena,
    }]).select().single()

    if (error) { alert('Error: ' + error.message); setLoading(false); return }

    // Si eligió spot, guardarlo
    if (spotSeleccionado && reserva) {
      await supabase.from('spots').upsert({
        clase_id:   claseSeleccionada.id,
        numero:     spotSeleccionado,
        estatus:    'ocupado',
        cliente_id: clienteSeleccionado.id,
      }, { onConflict: 'clase_id,numero' })
    }

    onSuccess(); onClose(); resetForm()
    setLoading(false)
  }

  // ── Filtros paso 2 ────────────────────────────────────────────────────────────
  const diasDisponibles = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d
  })

  const clasesFiltradas = clases.filter(c => {
    const f = new Date(c.horario)
    const mismaFecha = f.toDateString() === fechaActiva.toDateString()
    const sucOk = sucursalFiltro === 'Todas' || c.sucursales?.nombre === sucursalFiltro
    const horOk = horarioFiltro === 'Cualquiera' || getHorarioLabel(f.getHours()) === horarioFiltro
    return mismaFecha && sucOk && horOk
  })

  const clientesFiltrados = clientes.filter(c =>
    !busCliente || c.nombre_completo.toLowerCase().includes(busCliente.toLowerCase()) ||
    c.email.toLowerCase().includes(busCliente.toLowerCase())
  )

  // ── Spot colors ───────────────────────────────────────────────────────────────
  const getSpotStyle = (spot: Spot, num: number) => {
    if (spot.estatus === 'coach')     return 'bg-gray-800 text-white'
    if (spot.estatus === 'bloqueado') return 'bg-gray-200 text-gray-400 cursor-not-allowed'
    if (spot.estatus === 'ocupado')   return 'bg-gray-700 text-white cursor-not-allowed'
    if (spotSeleccionado === num)     return 'bg-gray-900 text-white ring-2 ring-gray-900 ring-offset-1'
    return 'bg-white border-2 border-gray-200 text-gray-700 hover:border-gray-900 cursor-pointer'
  }

  const DIAS_SHORT = ['dom','lun','mar','mié','jue','vie','sáb']
  const MESES_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

  const llena = claseSeleccionada && (claseSeleccionada.total_reservas || 0) >= claseSeleccionada.capacidad_max

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex justify-between items-center px-6 pt-5 pb-1">
          <div>
            <h2 className="text-base font-black text-gray-900">Nueva reserva</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Paso {step} de 3 · {step === 1 ? 'Cliente' : step === 2 ? 'Clase' : 'Spot'}
            </p>
          </div>
          <button onClick={() => { onClose(); resetForm() }} className="text-gray-400 hover:text-gray-700 transition">
            <X size={18}/>
          </button>
        </div>

        <ProgressBar step={step} />

        {/* ── PASO 1: Cliente ── */}
        {step === 1 && (
          <div className="px-6 pb-4">
            {/* Buscador */}
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input
                autoFocus
                placeholder="Buscar por nombre o email..."
                className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-gray-400 bg-gray-50"
                value={busCliente}
                onChange={e => { setBusCliente(e.target.value); setClienteSeleccionado(null) }}
              />
            </div>

            {/* Contador */}
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Cliente · {clientesFiltrados.length} totales
            </p>

            {/* Lista de clientes */}
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {clientesFiltrados.slice(0, 20).map(c => {
                const selected = clienteSeleccionado?.id === c.id
                return (
                  <button key={c.id} onClick={() => setClienteSeleccionado(selected ? null : c)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition ${
                      selected ? 'bg-green-50 border border-green-200' : 'hover:bg-gray-50 border border-transparent'
                    }`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${
                      selected ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {c.nombre_completo.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.nombre_completo}</p>
                      <p className="text-xs text-gray-400 truncate">{c.email}</p>
                    </div>
                    {selected && <Check size={16} className="text-green-600 flex-shrink-0"/>}
                  </button>
                )
              })}
            </div>

            {/* Cliente seleccionado — card verde */}
            {clienteSeleccionado && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <Check size={14} className="text-green-600 flex-shrink-0"/>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{clienteSeleccionado.nombre_completo}</p>
                  {(clienteSeleccionado.nombre_plan || clienteSeleccionado.plan) && (
                    <p className="text-xs text-green-700">
                      {clienteSeleccionado.nombre_plan || clienteSeleccionado.plan}
                      {clienteSeleccionado.clases_restantes != null && ` · ${clienteSeleccionado.clases_restantes} clases restantes`}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PASO 2: Clase ── */}
        {step === 2 && (
          <div className="px-6 pb-4 space-y-4">
            {/* Resumen cliente */}
            <p className="text-sm font-bold text-gray-900">{clienteSeleccionado?.nombre_completo}</p>

            {/* Filtro sucursales */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Sucursal</p>
              <div className="flex gap-2 flex-wrap">
                {['Todas', ...sucursales.map(s => s.nombre)].map(s => {
                  const suc  = sucursales.find(x => x.nombre === s)
                  const active = sucursalFiltro === s
                  return (
                    <button key={s} onClick={() => setSucursalFiltro(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition ${
                        active ? 'border-current text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400 bg-white'
                      }`}
                      style={active && suc ? { backgroundColor: suc.color, borderColor: suc.color } :
                             active ? { backgroundColor: '#111827', borderColor: '#111827' } : {}}>
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Selector de fecha */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Fecha</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {diasDisponibles.map((d, i) => {
                  const active = d.toDateString() === fechaActiva.toDateString()
                  const hoy    = d.toDateString() === new Date().toDateString()
                  return (
                    <button key={i} onClick={() => setFechaActiva(d)}
                      className={`flex flex-col items-center px-3 py-2 rounded-xl flex-shrink-0 transition border-2 min-w-[52px] ${
                        active ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                      }`}>
                      <span className="text-[10px] font-medium uppercase">{DIAS_SHORT[d.getDay()]}</span>
                      <span className="text-base font-black leading-tight">{d.getDate()}</span>
                      <span className="text-[10px]">{MESES_SHORT[d.getMonth()]}</span>
                      {hoy && !active && <span className="w-1 h-1 rounded-full bg-indigo-500 mt-0.5"/>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Filtro horario */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Horario</p>
              <div className="flex gap-2">
                {HORARIO_FILTERS.map(h => (
                  <button key={h} onClick={() => setHorarioFiltro(h)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition ${
                      horarioFiltro === h ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                    }`}>
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista de clases */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                {clasesFiltradas.length} clases disponibles
              </p>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {clasesFiltradas.length === 0 ? (
                  <p className="text-sm text-gray-400 italic text-center py-6">No hay clases para este día</p>
                ) : clasesFiltradas.map(c => {
                  const hora      = new Date(c.horario).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', hour12: false })
                  const reservas  = c.total_reservas || 0
                  const selected  = claseSeleccionada?.id === c.id
                  const tipo      = c.tipo_clase || 'General'
                  const color     = c.sucursales?.color || '#6366f1'
                  return (
                    <button key={c.id} onClick={() => setClaseSeleccionada(selected ? null : c)}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 transition flex items-center gap-3 ${
                        selected ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-300 bg-white'
                      }`}>
                      <span className="text-sm font-black text-gray-900 w-12 flex-shrink-0">{hora}</span>
                      <div className="w-0.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: color }}/>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900">{c.nombre_clase}</p>
                        <p className="text-xs text-gray-400">{tipo} · {c.salon} · {(c as any).duracion_minutos || 60} min</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        reservas >= c.capacidad_max ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {reservas}/{c.capacidad_max}
                      </span>
                      {selected && <Check size={14} className="text-gray-900 flex-shrink-0"/>}
                    </button>
                  )
                })}
              </div>
            </div>

            {yaReservado && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-xs font-bold">
                <AlertCircle size={13}/> Este socio ya tiene una reserva en esta clase
              </div>
            )}
          </div>
        )}

        {/* ── PASO 3: Spot ── */}
        {step === 3 && (
          <div className="px-6 pb-4 space-y-4">
            {/* Resumen */}
            <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
              <span className="font-bold text-gray-900">{clienteSeleccionado?.nombre_completo}</span>
              <span>·</span>
              <span>{claseSeleccionada?.sucursales?.nombre}</span>
              <span>·</span>
              <span>{claseSeleccionada && new Date(claseSeleccionada.horario).toLocaleDateString('es-MX', { weekday:'short', day:'numeric', month:'short' })}</span>
              <span>·</span>
              <span>{claseSeleccionada && new Date(claseSeleccionada.horario).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', hour12: false })}</span>
              <span>·</span>
              <span>{claseSeleccionada?.nombre_clase}</span>
            </div>

            {/* Grid de spots */}
            <div className="grid grid-cols-5 gap-2">
              {spots.map(spot => {
                const esCoach    = spot.estatus === 'coach'
                const bloqueado  = spot.estatus === 'bloqueado' || spot.estatus === 'ocupado'
                return (
                  <div key={spot.numero} className="relative">
                    {esCoach && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full z-10 whitespace-nowrap">
                        COACH
                      </span>
                    )}
                    <button
                      disabled={bloqueado}
                      onClick={() => !bloqueado && setSpotSeleccionado(spotSeleccionado === spot.numero ? null : spot.numero)}
                      className={`w-full aspect-square rounded-xl text-sm font-bold transition flex items-center justify-center ${getSpotStyle(spot, spot.numero)}`}
                    >
                      {spot.numero}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Leyenda */}
            <div className="flex items-center gap-4 flex-wrap">
              {[
                { label: `Disponible · ${spots.filter(s => s.estatus === 'disponible').length}`, cls: 'border-2 border-gray-200 bg-white' },
                { label: `Seleccionado`, cls: 'bg-gray-900' },
                { label: `Ocupado · ${spots.filter(s => s.estatus === 'ocupado').length}`, cls: 'bg-gray-700' },
                { label: `Bloqueado · ${spots.filter(s => s.estatus === 'bloqueado').length}`, cls: 'bg-gray-200' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className={`w-3.5 h-3.5 rounded-md flex-shrink-0 ${l.cls}`}/>
                  <span className="text-[11px] text-gray-500">{l.label}</span>
                </div>
              ))}
            </div>

            {llena && (
              <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-yellow-700 text-xs font-bold">
                <AlertCircle size={13}/> Clase llena — el socio entrará a lista de espera
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          {step > 1 && (
            <button onClick={() => setStep(s => (s - 1) as 1|2|3)}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition">
              Atrás
            </button>
          )}
          <button onClick={() => { onClose(); resetForm() }}
            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <div className="flex-1"/>
          {step < 3 ? (
            <button
              onClick={() => setStep(s => (s + 1) as 1|2|3)}
              disabled={
                (step === 1 && !clienteSeleccionado) ||
                (step === 2 && (!claseSeleccionada || yaReservado))
              }
              className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl text-sm disabled:opacity-40 transition">
              Continuar
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl text-sm disabled:opacity-40 transition">
              <Check size={15}/>
              {loading ? 'Creando...' : 'Crear reserva'}
            </button>
          )}
        </div>

      </div>
    </div>
  )
}