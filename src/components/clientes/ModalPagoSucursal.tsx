'use client'
import { useState, useEffect } from 'react'
import { X, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Props {
  isOpen:    boolean
  cliente:   any
  onClose:   () => void
  onSuccess: () => void
}

const METODOS = ['Efectivo', 'Terminal']

function calcularFechaFin(fechaInicio: string, diasVigencia: number): string {
  const d = new Date(fechaInicio)
  d.setDate(d.getDate() + diasVigencia)
  return d.toISOString().split('T')[0]
}

export default function ModalPagoSucursal({ isOpen, cliente, onClose, onSuccess }: Props) {
  const [paso,          setPaso]          = useState<'form' | 'exito'>('form')
  const [paquetes,      setPaquetes]      = useState<any[]>([])
  const [paqueteId,     setPaqueteId]     = useState('')
  const [metodo,        setMetodo]        = useState('Efectivo')
  const [monto,         setMonto]         = useState('')
  const [referencia,    setReferencia]    = useState('')
  const [notas,         setNotas]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')

  useEffect(() => {
    if (!isOpen) return
    setPaso('form')
    setPaqueteId('')
    setMonto('')
    setReferencia('')
    setNotas('')
    setError('')
    setMetodo('Efectivo')

    const fetchPaquetes = async () => {
        console.log('sucursal_id del cliente:', cliente.sucursal_id)
        
        const { data: precios, error: errPrecios } = await supabase
            .from('paquete_precios')
            .select('paquete_id')
            .eq('sucursal_id', cliente.sucursal_id)
            .eq('activo', true)

        console.log('precios:', precios, 'error:', errPrecios)

        const paqueteIds = precios?.map(p => p.paquete_id) || []
        console.log('paqueteIds:', paqueteIds)

        if (paqueteIds.length > 0) {
            const { data } = await supabase
                .from('paquetes')
                .select('id, nombre, vigencia_dias, precio')
                .eq('estatus', 'Activo')
                .in('id', paqueteIds)
                .order('nombre')
            console.log('paquetes:', data)
            if (data) setPaquetes(data)
        }
        }
    fetchPaquetes()
    }, [isOpen])

  const paqueteSeleccionado = paquetes.find(p => p.id === paqueteId)

  const handleGuardar = async () => {
    if (!paqueteId)  { setError('Selecciona un paquete'); return }
    if (!monto)      { setError('Ingresa el monto'); return }
    if (metodo === 'Terminal' && !referencia) { setError('Ingresa el número de operación'); return }

    setLoading(true)
    setError('')

    const fechaInicio = new Date().toISOString().split('T')[0]
    const fechaFin    = paqueteSeleccionado?.vigencia_dias
      ? calcularFechaFin(fechaInicio, paqueteSeleccionado.vigencia_dias)
      : fechaInicio

    // 1. Crear pago
    const { error: errPago } = await supabase.from('pagos').insert({
      cliente_id:   cliente.id,
      monto:        Number(monto),
      metodo_pago:  metodo,
      fecha_pago:   new Date().toISOString(),
      estatus:      'Completado',
      concepto:     `Pago en sucursal · ${paqueteSeleccionado?.nombre}`,
      canal:        'Navy',
      sucursal_id:  cliente.sucursal_id || null,
      referencia:   referencia || null,
      notas:        notas || null,
    })

    if (errPago) { setError('Error al registrar el pago'); setLoading(false); return }

    // 2. Desactivar membresía anterior si existe
    await supabase.from('membresias')
      .update({ estatus: 'Inactiva' })
      .eq('cliente_id', cliente.id)
      .eq('estatus', 'Activa')

    // 3. Crear nueva membresía
    const { error: errMemb } = await supabase.from('membresias').insert({
      cliente_id:    cliente.id,
      paquete_id:    paqueteId,
      fecha_inicio:  fechaInicio,
      fecha_fin:     fechaFin,
      estatus:       'Activa',
      precio_pagado: Number(monto),
      origen:        'Sucursal',
      notas:         notas || null,
    })

    if (errMemb) { setError('Error al crear membresía'); setLoading(false); return }

    // 4. Actualizar plan del cliente
    await supabase.from('clientes').update({
      plan:                      paqueteSeleccionado?.nombre,
      paquete_id:                paqueteId,
      fecha_vencimiento_memb:    fechaFin,
    }).eq('id', cliente.id)

    setLoading(false)
    setPaso('exito')
    onSuccess()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-black text-gray-900">Pago en sucursal</p>
            <p className="text-xs text-gray-400 mt-0.5">{cliente?.nombre_completo}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        {paso === 'exito' ? (
          <div className="px-6 py-10 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <span className="text-2xl">✓</span>
            </div>
            <p className="text-lg font-black text-gray-900">Pago registrado</p>
            <p className="text-sm text-gray-400">
              La membresía de <strong>{cliente?.nombre_completo}</strong> fue activada exitosamente.
            </p>
            <button onClick={onClose}
              className="mt-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-700 transition">
              Cerrar
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">

            {/* Paquete */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Paquete</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-gray-50 outline-none focus:border-gray-400"
                value={paqueteId}
                onChange={e => { setPaqueteId(e.target.value); setMonto(paquetes.find(p => p.id === e.target.value)?.precio_app?.toString() || '') }}>
                <option value="">Seleccionar paquete</option>
                {paquetes.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            {/* Método de pago */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Método de pago</label>
              <div className="flex gap-2">
                {METODOS.map(m => (
                  <button key={m}
                    onClick={() => setMetodo(m)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition ${
                      metodo === m
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Monto */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Monto</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-sm text-gray-900 bg-gray-50 outline-none focus:border-gray-400"
                  placeholder="0"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                />
              </div>
            </div>

            {/* Número de operación */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">
                Número de operación / ticket
                {metodo === 'Terminal' && <span className="text-red-500 ml-0.5">*</span>}
                {metodo === 'Efectivo' && <span className="text-gray-400 font-normal ml-1">(opcional)</span>}
              </label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-gray-50 outline-none focus:border-gray-400"
                placeholder="Ej. TXN-001234"
                value={referencia}
                onChange={e => setReferencia(e.target.value)}
              />
            </div>

            {/* Notas */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Notas <span className="text-gray-400 font-normal">(opcional)</span></label>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-gray-50 outline-none focus:border-gray-400 resize-none"
                rows={2}
                placeholder="Observaciones del pago..."
                value={notas}
                onChange={e => setNotas(e.target.value)}
              />
            </div>

            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

            {/* Footer */}
            <div className="flex gap-2 pt-1">
              <button onClick={onClose}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button
                onClick={handleGuardar}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition disabled:opacity-50"
                style={{ backgroundColor: '#171B24' }}>
                {loading ? <RefreshCw size={12} className="animate-spin mx-auto" /> : 'Registrar pago'}
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}