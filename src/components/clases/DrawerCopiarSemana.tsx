'use client'
import { useState, useEffect } from 'react'
import { X, Copy, Calendar, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Props {
  isOpen:      boolean
  onClose:     () => void
  onSuccess:   () => void
  fechaActiva: Date
  sucursalId:  string
  sucursalNombre: string
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function getInicioSemana(fecha: Date) {
  const d   = new Date(fecha)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function getFinSemana(inicio: Date) {
  const d = new Date(inicio)
  d.setDate(d.getDate() + 6)
  d.setHours(23, 59, 59, 999)
  return d
}

function formatSemana(inicio: Date) {
  const fin = getFinSemana(inicio)
  return `${inicio.getDate()} ${inicio.toLocaleDateString('es-MX', { month: 'short' })} – ${fin.getDate()} ${fin.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}`
}

function addWeeks(date: Date, weeks: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + weeks * 7)
  return d
}

type Modo = 'semana' | 'dia'

export default function ModalCopiarSemana({ isOpen, onClose, onSuccess, fechaActiva, sucursalId, sucursalNombre }: Props) {
  const [modo,           setModo]           = useState<Modo>('semana')
  const [loading,        setLoading]        = useState(false)
  const [loadingClases,  setLoadingClases]  = useState(false)
  const [clasesSemana,   setClasesSemana]   = useState<any[]>([])
  const [diasSeleccionados, setDiasSeleccionados] = useState<number[]>([0,1,2,3,4,5,6])
  const [diaOrigen,      setDiaOrigen]      = useState<number>(0)
  const [diaDestino,     setDiaDestino]     = useState<Date>(new Date())
  const [semanasDestino, setSemanasDestino] = useState<Date[]>([])
  const [semanaDestino,  setSemanaDestino]  = useState<Date>(addWeeks(getInicioSemana(fechaActiva), 1))
  const [popup,          setPopup]          = useState<'confirmar' | 'reemplazar' | null>(null)
  const [conflictos,     setConflictos]     = useState(0)
  const [copiando,       setCopiando]       = useState(false)

  const inicioOrigen = getInicioSemana(fechaActiva)
  const diasOrigen   = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicioOrigen)
    d.setDate(d.getDate() + i)
    return d
  })

  // Cargar clases de la semana origen
  useEffect(() => {
    if (!isOpen || !sucursalId) return
    setLoadingClases(true)
    const inicio = getInicioSemana(fechaActiva)
    const fin    = getFinSemana(inicio)

    supabase.from('clases')
      .select('*, staff(nombre, primer_apellido)')
      .eq('sucursal_id', sucursalId)
      .gte('horario', inicio.toISOString())
      .lte('horario', fin.toISOString())
      .order('horario')
      .then(({ data }) => {
        setClasesSemana(data || [])
        setLoadingClases(false)
      })
  }, [isOpen, sucursalId, fechaActiva])

  useEffect(() => {
    if (!isOpen) return
    setModo('semana')
    setDiasSeleccionados([0,1,2,3,4,5,6])
    setSemanaDestino(addWeeks(getInicioSemana(fechaActiva), 1))
    setSemanasDestino([])
    setPopup(null)
  }, [isOpen])

  const toggleDia = (i: number) => {
    setDiasSeleccionados(prev =>
      prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]
    )
  }

  const toggleSemanaDestino = (semana: Date) => {
    const key = semana.toISOString()
    setSemanasDestino(prev => {
      const existe = prev.some(s => s.toISOString() === key)
      return existe ? prev.filter(s => s.toISOString() !== key) : [...prev, semana]
    })
  }

  // Clases filtradas según días seleccionados
  const clasesFiltradas = modo === 'semana'
    ? clasesSemana.filter(c => {
        const dia = new Date(c.horario).getDay()
        const idx = dia === 0 ? 6 : dia - 1
        return diasSeleccionados.includes(idx)
      })
    : clasesSemana.filter(c => {
        const dia = new Date(c.horario).getDay()
        const idx = dia === 0 ? 6 : dia - 1
        return idx === diaOrigen
      })

  const semanasADestino = modo === 'semana' ? semanasDestino : []

  // Verificar conflictos
  const verificarConflictos = async () => {
    let total = 0
    const destinos = modo === 'semana' ? semanasDestino : [getInicioSemana(diaDestino)]

    for (const semanaD of destinos) {
      const inicio = new Date(semanaD)
      const fin    = getFinSemana(inicio)
      const { data } = await supabase.from('clases')
        .select('id')
        .eq('sucursal_id', sucursalId)
        .gte('horario', inicio.toISOString())
        .lte('horario', fin.toISOString())
      total += data?.length || 0
    }
    return total
  }

  const handleCopiar = async (reemplazar: boolean) => {
    setCopiando(true)
    const destinos = modo === 'semana' ? semanasDestino : []

    // Si es modo día, calcular destino
    const diasADestino = modo === 'dia'
      ? [{ origen: diaOrigen, destino: diaDestino }]
      : null

    for (const diaIdx of (modo === 'semana' ? diasSeleccionados : [])) {
      const clasesDelDia = clasesSemana.filter(c => {
        const dia = new Date(c.horario).getDay()
        const idx = dia === 0 ? 6 : dia - 1
        return idx === diaIdx
      })

      for (const semanaD of destinos) {
        if (reemplazar) {
          // Borrar clases existentes en ese día de la semana destino
          const diaDestFecha = new Date(semanaD)
          diaDestFecha.setDate(diaDestFecha.getDate() + diaIdx)
          const inicioDia = new Date(diaDestFecha); inicioDia.setHours(0,0,0,0)
          const finDia    = new Date(diaDestFecha); finDia.setHours(23,59,59,999)
          await supabase.from('clases')
            .delete()
            .eq('sucursal_id', sucursalId)
            .gte('horario', inicioDia.toISOString())
            .lte('horario', finDia.toISOString())
        }

        // Crear clases copiadas
        for (const clase of clasesDelDia) {
          const horarioOrigen  = new Date(clase.horario)
          const nuevaFecha     = new Date(semanaD)
          nuevaFecha.setDate(nuevaFecha.getDate() + diaIdx)
          nuevaFecha.setHours(horarioOrigen.getHours(), horarioOrigen.getMinutes(), 0, 0)

          const { data: claseCopiada } = await supabase.from('clases').insert({
            nombre_clase:      clase.nombre_clase,
            coach_id:          clase.coach_id,
            sucursal_id:       clase.sucursal_id,
            instructor:        clase.instructor,
            horario:           nuevaFecha.toISOString(),
            duracion_minutos:  clase.duracion_minutos,
            capacidad_max:     clase.capacidad_max,
            descripcion:       clase.descripcion,
            es_recurrente:     false,
            estado:            'Activa',
            tipo_clase:        clase.tipo_clase,
            salon:             clase.salon,
            categoria_id:      clase.categoria_id,
            publicar_wellhub:  clase.publicar_wellhub,
            semana_copiada_de: clase.id,
            room_id:           clase.room_id,
          }).select().single()

          // Publicar en Wellhub si aplica
          if (clase.publicar_wellhub && claseCopiada) {
            try {
              await fetch('/api/wellhub/publicar-clase', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  claseId:         claseCopiada.id,
                  nombre:          clase.nombre_clase,
                  descripcion:     clase.descripcion,
                  horario:         nuevaFecha.toISOString(),
                  duracionMinutos: clase.duracion_minutos,
                  capacidadMax:    clase.capacidad_max,
                  room_id:         clase.room_id,
                }),
              })
            } catch { /* silencioso */ }
          }
        }
      }
    }

    // Modo día
    if (modo === 'dia') {
      const clasesDelDia = clasesSemana.filter(c => {
        const dia = new Date(c.horario).getDay()
        const idx = dia === 0 ? 6 : dia - 1
        return idx === diaOrigen
      })

      if (reemplazar) {
        const inicioDia = new Date(diaDestino); inicioDia.setHours(0,0,0,0)
        const finDia    = new Date(diaDestino); finDia.setHours(23,59,59,999)
        await supabase.from('clases')
          .delete()
          .eq('sucursal_id', sucursalId)
          .gte('horario', inicioDia.toISOString())
          .lte('horario', finDia.toISOString())
      }

      for (const clase of clasesDelDia) {
        const horarioOrigen = new Date(clase.horario)
        const nuevaFecha    = new Date(diaDestino)
        nuevaFecha.setHours(horarioOrigen.getHours(), horarioOrigen.getMinutes(), 0, 0)

        const { data: claseCopiada } = await supabase.from('clases').insert({
          nombre_clase:      clase.nombre_clase,
          coach_id:          clase.coach_id,
          sucursal_id:       clase.sucursal_id,
          instructor:        clase.instructor,
          horario:           nuevaFecha.toISOString(),
          duracion_minutos:  clase.duracion_minutos,
          capacidad_max:     clase.capacidad_max,
          descripcion:       clase.descripcion,
          es_recurrente:     false,
          estado:            'Activa',
          tipo_clase:        clase.tipo_clase,
          salon:             clase.salon,
          categoria_id:      clase.categoria_id,
          publicar_wellhub:  clase.publicar_wellhub,
          semana_copiada_de: clase.id,
          room_id:           clase.room_id,
        }).select().single()

        if (clase.publicar_wellhub && claseCopiada) {
          try {
            await fetch('/api/wellhub/publicar-clase', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                claseId:         claseCopiada.id,
                nombre:          clase.nombre_clase,
                descripcion:     clase.descripcion,
                horario:         nuevaFecha.toISOString(),
                duracionMinutos: clase.duracion_minutos,
                capacidadMax:    clase.capacidad_max,
                room_id:         clase.room_id,
              }),
            })
          } catch { /* silencioso */ }
        }
      }
    }

    setCopiando(false)
    setPopup(null)
    onSuccess()
    onClose()
  }

  const handleConfirmar = async () => {
    setLoading(true)
    const total = await verificarConflictos()
    setConflictos(total)
    setLoading(false)
    if (total > 0) setPopup('reemplazar')
    else setPopup('confirmar')
  }

  const canCopiar = modo === 'semana'
    ? semanasDestino.length > 0 && diasSeleccionados.length > 0 && clasesFiltradas.length > 0
    : clasesFiltradas.length > 0

  if (!isOpen) return null

    return (
    <>
        {/* Overlay */}
        <div onClick={onClose} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />

        {/* Drawer */}
        <div className="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-2xl flex flex-col">

        {/* Popup confirmar */}
        {popup === 'confirmar' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-black/20">
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 px-6 py-5 w-full flex flex-col gap-3">
                <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-xl">📋</div>
                <div>
                    <p className="text-sm font-black text-gray-900">¿Confirmar copia?</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                    Se copiarán <strong>{clasesFiltradas.length}</strong> clases
                    {modo === 'semana' ? ` a ${semanasDestino.length} semana${semanasDestino.length > 1 ? 's' : ''}` : ' al día seleccionado'}
                    </p>
                </div>
                </div>
                <div className="flex gap-2">
                <button onClick={() => setPopup(null)}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
                    Cancelar
                </button>
                <button onClick={() => handleCopiar(false)} disabled={copiando}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-40"
                    style={{ backgroundColor: '#171B24' }}>
                    {copiando ? 'Copiando...' : 'Sí, copiar'}
                </button>
                </div>
            </div>
            </div>
        )}

        {/* Popup reemplazar */}
        {popup === 'reemplazar' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-black/20">
            <div className="bg-white rounded-2xl shadow-2xl border border-amber-100 px-6 py-5 w-full flex flex-col gap-3">
                <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-xl">⚠️</div>
                <div>
                    <p className="text-sm font-black text-gray-900">Ya hay clases en ese período</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                    Se encontraron <strong>{conflictos}</strong> clases existentes. ¿Qué quieres hacer?
                    </p>
                </div>
                </div>
                <div className="flex flex-col gap-2">
                <button onClick={() => handleCopiar(true)} disabled={copiando}
                    className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 transition disabled:opacity-40">
                    {copiando ? 'Copiando...' : 'Reemplazar clases existentes'}
                </button>
                <button onClick={() => handleCopiar(false)} disabled={copiando}
                    className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-40"
                    style={{ backgroundColor: '#171B24' }}>
                    {copiando ? 'Copiando...' : 'Agregar sin reemplazar'}
                </button>
                <button onClick={() => setPopup(null)}
                    className="w-full py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
                    Cancelar
                </button>
                </div>
            </div>
            </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
            <div>
            <h2 className="text-lg font-black text-gray-900">Copiar horario</h2>
            <p className="text-xs text-gray-400 mt-0.5">{sucursalNombre} · {formatSemana(inicioOrigen)}</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={18} />
            </button>
        </div>

        {/* Tabs modo */}
        <div className="flex border-b border-gray-100">
            {([
            { key: 'semana', label: '📅 Por semana' },
            { key: 'dia',    label: '📆 Por día' },
            ] as { key: Modo; label: string }[]).map(t => (
            <button key={t.key} onClick={() => setModo(t.key)}
                className={`flex-1 py-3 text-xs font-bold border-b-2 transition ${
                modo === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}>
                {t.label}
            </button>
            ))}
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {loadingClases ? (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                <RefreshCw size={14} className="animate-spin" /> Cargando clases...
            </div>
            ) : clasesSemana.length === 0 ? (
            <div className="text-center py-12 text-gray-400 italic text-sm">
                No hay clases en la semana {formatSemana(inicioOrigen)}
            </div>
            ) : (
            <>
                {modo === 'semana' && (
                <>
                    <div className="space-y-2">
                    <p className="text-xs font-black text-gray-500 uppercase tracking-wide">Días a copiar</p>
                    <div className="flex gap-2 flex-wrap">
                        {DIAS.map((dia, i) => {
                        const clasesDelDia = clasesSemana.filter(c => {
                            const d = new Date(c.horario).getDay()
                            return (d === 0 ? 6 : d - 1) === i
                        })
                        if (clasesDelDia.length === 0) return null
                        const seleccionado = diasSeleccionados.includes(i)
                        return (
                            <button key={i} type="button" onClick={() => toggleDia(i)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                                seleccionado ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                            }`}>
                            {dia}
                            <span className={`text-[10px] px-1 rounded-full ${seleccionado ? 'bg-white/20' : 'bg-gray-100'}`}>
                                {clasesDelDia.length}
                            </span>
                            </button>
                        )
                        })}
                    </div>
                    </div>

                    <div className="space-y-2">
                    <p className="text-xs font-black text-gray-500 uppercase tracking-wide">Semanas destino</p>
                    <div className="space-y-2">
                        {Array.from({ length: 8 }, (_, i) => {
                        const semana       = addWeeks(inicioOrigen, i + 1)
                        const key          = semana.toISOString()
                        const seleccionada = semanasDestino.some(s => s.toISOString() === key)
                        return (
                            <button key={i} type="button" onClick={() => toggleSemanaDestino(semana)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition ${
                                seleccionada ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
                            }`}>
                            <div className="flex items-center gap-2">
                                <Calendar size={14} className={seleccionada ? 'text-indigo-500' : 'text-gray-400'} />
                                <span className="font-semibold">{formatSemana(semana)}</span>
                            </div>
                            {seleccionada && <span className="text-xs font-black text-indigo-500">✓</span>}
                            </button>
                        )
                        })}
                    </div>
                    </div>
                </>
                )}

                {modo === 'dia' && (
                <>
                    <div className="space-y-2">
                    <p className="text-xs font-black text-gray-500 uppercase tracking-wide">Día a copiar</p>
                    <div className="flex gap-2 flex-wrap">
                        {DIAS.map((dia, i) => {
                        const clasesDelDia = clasesSemana.filter(c => {
                            const d = new Date(c.horario).getDay()
                            return (d === 0 ? 6 : d - 1) === i
                        })
                        if (clasesDelDia.length === 0) return null
                        return (
                            <button key={i} type="button" onClick={() => setDiaOrigen(i)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                                diaOrigen === i ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                            }`}>
                            {dia} — {diasOrigen[i].getDate()}
                            <span className={`text-[10px] px-1 rounded-full ${diaOrigen === i ? 'bg-white/20' : 'bg-gray-100'}`}>
                                {clasesDelDia.length}
                            </span>
                            </button>
                        )
                        })}
                    </div>
                    </div>

                    <div className="space-y-2">
                    <p className="text-xs font-black text-gray-500 uppercase tracking-wide">Día destino</p>
                    <input type="date"
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 bg-gray-50"
                        value={diaDestino.toISOString().split('T')[0]}
                        onChange={e => setDiaDestino(new Date(e.target.value + 'T12:00:00'))} />
                    </div>
                </>
                )}

                {/* Resumen */}
                {clasesFiltradas.length > 0 && (
                <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                    Resumen — {clasesFiltradas.length} clases a copiar
                    </p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                    {clasesFiltradas.map(c => (
                        <div key={c.id} className="flex items-center justify-between text-xs text-gray-600">
                        <span className="font-medium">{c.nombre_clase}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400">
                            {new Date(c.horario).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' })}
                            {' · '}
                            {new Date(c.horario).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </span>
                            {c.publicar_wellhub && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-500">
                                Wellhub
                            </span>
                            )}
                        </div>
                        </div>
                    ))}
                    </div>
                </div>
                )}
            </>
            )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
            <button onClick={onClose}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
            Cancelar
            </button>
            <button onClick={handleConfirmar}
            disabled={!canCopiar || loading || copiando}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition flex items-center justify-center gap-2"
            style={{ backgroundColor: '#171B24' }}>
            {loading
                ? <><RefreshCw size={14} className="animate-spin" /> Verificando...</>
                : <><Copy size={14} /> Copiar horario</>
            }
            </button>
        </div>
        </div>
    </>
    )
}