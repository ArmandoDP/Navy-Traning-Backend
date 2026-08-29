'use client'
import { useEffect, useRef, useState } from 'react'
import jsQR                            from 'jsqr'
import { supabase }                    from '@/lib/supabase'
import { QrCode, Camera, CameraOff }   from 'lucide-react'
import CheckinResultado                from './CheckinResultado'
import CheckinNuevoCliente             from './CheckinNuevoCliente'

interface Props {
  sucursalId:     string | null
  sucursalNombre: string
  onCheckin:      () => void
}

export default function CheckinScanner({ sucursalId, sucursalNombre, onCheckin }: Props) {
  const [activo,       setActivo]       = useState(false)
  const [procesando,   setProcesando]   = useState(false)
  const [resultado,    setResultado]    = useState<any>(null)
  const [nuevoCliente, setNuevoCliente] = useState<any>(null)
  const [error,        setError]        = useState('')

  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const rafRef      = useRef<number | null>(null)
  const procesandoRef = useRef(false)

  const iniciarScanner = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setActivo(true)
    } catch (e: any) {
      setError('No se pudo acceder a la cámara. Verifica los permisos.')
    }
  }

  const detenerScanner = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setActivo(false)
  }

  // Loop de detección de QR
  useEffect(() => {
    if (!activo) return

    const detectar = () => {
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(detectar)
        return
      }

      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const qr        = jsQR(imageData.data, imageData.width, imageData.height)

      if (qr && !procesandoRef.current) {
        procesandoRef.current = true
        detenerScanner()
        onScanExito(qr.data)
      } else {
        rafRef.current = requestAnimationFrame(detectar)
      }
    }

    rafRef.current = requestAnimationFrame(detectar)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [activo])

  useEffect(() => {
    return () => detenerScanner()
  }, [])

  const onScanExito = async (qrData: string) => {
    setProcesando(true)

    try {
      const { data: reserva, error: errReserva } = await supabase
        .from('reservas')
        .select(`
          *,
          clientes(id, nombre_completo, paquete_id, es_invitado, paquetes(nombre)),
          clases(id, nombre_clase, horario, duracion_minutos, sucursal_id, sucursales(id, nombre, color))
        `)
        .eq('id', qrData)
        .single()

      if (errReserva || !reserva) {
        setResultado({ tipo: 'error', mensaje: 'QR inválido — reserva no encontrada' })
        setProcesando(false)
        procesandoRef.current = false
        return
      }

      // Verificar que la clase es de hoy
      const hoy        = new Date().toDateString()
      const fechaClase = new Date(reserva.clases.horario).toDateString()
      if (hoy !== fechaClase) {
        setResultado({
          tipo:    'error',
          mensaje: `Esta reserva es para ${new Date(reserva.clases.horario).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}`,
        })
        setProcesando(false)
        procesandoRef.current = false
        return
      }

      // Verificar sucursal
      if (sucursalId && reserva.clases.sucursal_id !== sucursalId) {
        setResultado({
          tipo:    'sucursal_incorrecta',
          mensaje: `Este QR es para ${reserva.clases.sucursales.nombre}`,
          detalle: {
            clase:    reserva.clases.nombre_clase,
            sucursal: reserva.clases.sucursales.nombre,
            horario:  new Date(reserva.clases.horario).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
          }
        })
        setProcesando(false)
        procesandoRef.current = false
        return
      }

      // Verificar duplicado
      const { data: checkinExistente } = await supabase
        .from('asistencias')
        .select('id')
        .eq('cliente_id', reserva.cliente_id)
        .eq('clase_id', reserva.clase_id)
        .maybeSingle()

      if (checkinExistente) {
        setResultado({
          tipo:    'duplicado',
          mensaje: `${reserva.clientes.nombre_completo} ya hizo check-in`,
          reserva,
        })
        setProcesando(false)
        procesandoRef.current = false
        return
      }

      // Verificar si es nuevo cliente
      const { count } = await supabase
        .from('asistencias')
        .select('id', { count: 'exact' })
        .eq('cliente_id', reserva.cliente_id)

      const esNuevo = (count || 0) === 0

      // Registrar check-in
      await supabase.from('asistencias').insert({
        cliente_id:    reserva.cliente_id,
        clase_id:      reserva.clase_id,
        sucursal_id:   reserva.clases.sucursal_id,
        fecha_checkin: new Date().toISOString(),
      })

      await supabase.from('reservas').update({ estatus: 'Asistida' }).eq('id', reserva.id)

      onCheckin()

      if (esNuevo) {
        setNuevoCliente({ reserva })
      } else {
        setResultado({ tipo: 'exito', reserva })
      }

    } catch (e: any) {
      setResultado({ tipo: 'error', mensaje: 'Error al procesar el check-in' })
    }

    setProcesando(false)
    procesandoRef.current = false
  }

  const resetear = () => {
    setResultado(null)
    setNuevoCliente(null)
    setError('')
    procesandoRef.current = false
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <QrCode size={18} className="text-gray-500" />
          <div>
            <p className="text-sm font-black text-gray-900">Lector de QR</p>
            <p className="text-xs text-gray-400">{sucursalNombre}</p>
          </div>
        </div>
        <button
          onClick={activo ? detenerScanner : iniciarScanner}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
            activo
              ? 'bg-red-50 text-red-600 hover:bg-red-100'
              : 'bg-gray-900 text-white hover:bg-gray-700'
          }`}>
          {activo ? <><CameraOff size={14}/> Detener</> : <><Camera size={14}/> Activar cámara</>}
        </button>
      </div>

      {/* Área de escaneo */}
      <div className="p-5">
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 font-medium mb-4">
            {error}
          </div>
        )}

        {!activo && !resultado && !nuevoCliente && !procesando && (
          <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center">
              <QrCode size={36} className="text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-700">Cámara inactiva</p>
              <p className="text-xs text-gray-400 mt-1">Activa la cámara para escanear el QR del cliente</p>
            </div>
          </div>
        )}

        {procesando && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Validando check-in...</p>
          </div>
        )}

        {/* Video de la cámara */}
        <div className="relative" style={{ display: activo ? 'block' : 'none' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', borderRadius: '12px', display: 'block' }}
          />
          {/* Guía de escaneo */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border-2 border-white rounded-xl"
              style={{ width: '200px', height: '200px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)' }} />
          </div>
        </div>

        {/* Canvas oculto para procesar frames */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {resultado && !nuevoCliente && (
          <CheckinResultado resultado={resultado} onReset={resetear} />
        )}

        {nuevoCliente && (
          <CheckinNuevoCliente data={nuevoCliente} onContinuar={resetear} />
        )}
      </div>
    </div>
  )
}