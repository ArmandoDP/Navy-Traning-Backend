'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X, UserPlus } from 'lucide-react'

interface Props {
  titularId: string
  onClose:   () => void
}

const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 bg-gray-50 transition placeholder:text-gray-400"

function generarPasswordTemporal(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return 'NAVY-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function ModalInvitado({ titularId, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    nombre:          '',
    primer_apellido: '',
    email:           '',
    telefono:        '',
  })

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleCrearInvitado = async () => {
    if (!form.nombre || !form.email) return
    setLoading(true)

    const passwordTemporal = generarPasswordTemporal()

    // 1. Traer datos del titular para copiar membresía
    const { data: titular } = await supabase
      .from('clientes')
      .select('sucursal_id, paquete_id, membresias(fecha_inicio, fecha_fin, paquete_id)')
      .eq('id', titularId)
      .single()

    const membresia = titular?.membresias?.[0]

    // 2. Crear usuario Auth
    try {
      await fetch('/api/clientes/crear-usuario', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: form.email, password: passwordTemporal }),
      })
    } catch { console.warn('No se pudo crear usuario Auth') }

    // 3. Crear cliente invitado
    const { data: invitado } = await supabase.from('clientes').insert({
      nombre_completo:       `${form.nombre} ${form.primer_apellido}`.trim(),
      primer_apellido:       form.primer_apellido,
      email:                 form.email,
      telefono:              form.telefono,
      sucursal_id:           titular?.sucursal_id || null,
      paquete_id:            titular?.paquete_id  || null,
      estatus:               'Activo',
      origen:                'Invitado',
      es_invitado:           true,
      invitado_de:           titularId,
      password_temporal:     passwordTemporal,
      debe_cambiar_password: true,
    }).select().single()

    // 4. Crear membresía vinculada al titular
    if (invitado && membresia) {
      await supabase.from('membresias').insert({
        cliente_id:    invitado.id,
        paquete_id:    membresia.paquete_id,
        fecha_inicio:  membresia.fecha_inicio,
        fecha_fin:     membresia.fecha_fin,
        estatus:       'Activa',
        precio_pagado: 0,
        origen:        'Invitado',
      })
    }

    // 5. Mandar correo de invitación
    await fetch('/api/clientes/correo-invitado', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        email:             form.email,
        nombre:            form.nombre,
        password_temporal: passwordTemporal,
        titular_id:        titularId,
      }),
    })

    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                <UserPlus size={16} className="text-indigo-600" />
              </div>
              <h3 className="text-lg font-black text-gray-900">Registrar invitado</h3>
            </div>
            <p className="text-xs text-gray-400">
              Este paquete incluye un usuario adicional. Registra al invitado para que pueda acceder a la app.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition">
            <X size={16} />
          </button>
        </div>

        {/* Info */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 mb-5">
          <p className="text-xs font-bold text-indigo-700 mb-1">👥 Paquete con 2 usuarios</p>
          <p className="text-xs text-indigo-600">
            El invitado tendrá acceso a las mismas clases y beneficios que el titular, sin costo adicional. Su membresía estará vinculada al titular.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Nombre <span className="text-red-500">*</span></label>
              <input placeholder="Nombre" className={inputCls}
                value={form.nombre} onChange={e => set('nombre', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Apellido</label>
              <input placeholder="Apellido" className={inputCls}
                value={form.primer_apellido} onChange={e => set('primer_apellido', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Correo electrónico <span className="text-red-500">*</span></label>
            <input type="email" placeholder="correo@ejemplo.com" className={inputCls}
              value={form.email} onChange={e => set('email', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Teléfono</label>
            <input placeholder="Teléfono" className={inputCls}
              value={form.telefono} onChange={e => set('telefono', e.target.value)} />
          </div>

          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">Se enviará al invitado:</p>
            <p className="text-xs text-gray-700"><span className="font-bold">Usuario:</span> {form.email || 'correo del invitado'}</p>
            <p className="text-xs text-gray-700"><span className="font-bold">Contraseña temporal:</span> NAVY-XXXXXX</p>
            <p className="text-[11px] text-amber-600 mt-1">⚠ El invitado deberá cambiar su contraseña al primer inicio</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition">
            Omitir por ahora
          </button>
          <button onClick={handleCrearInvitado}
            disabled={loading || !form.nombre || !form.email}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition"
            style={{ backgroundColor: '#171B24' }}>
            {loading ? 'Creando...' : 'Crear invitado →'}
          </button>
        </div>
      </div>
    </div>
  )
}