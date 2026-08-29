'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { KeyRound, Mail, Eye, EyeOff, RefreshCw } from 'lucide-react'

interface Props {
  empleado:  any
  onRefresh: () => void
}

function generarPasswordTemporal(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return 'NAVY-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function StaffTabAcceso({ empleado, onRefresh }: Props) {
  const [loading,       setLoading]       = useState(false)
  const [mostrarPass,   setMostrarPass]   = useState(false)
  const [toast,         setToast]         = useState('')

  const tieneAcceso    = !!empleado.supabase_user_id
  const debeCambiar    = empleado.debe_cambiar_password
  const passTemp       = empleado.password_temporal

  const handleGenerarCredenciales = async () => {
    setLoading(true)
    try {
      const password = generarPasswordTemporal()

      // Crear o actualizar usuario en Supabase Auth
      if (!tieneAcceso) {
        const res = await fetch('/api/clientes/crear-usuario', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email: empleado.email, password }),
        })
        const data = await res.json()
        if (data.userId) {
          await supabase.from('staff').update({
            supabase_user_id:      data.userId,
            password_temporal:     password,
            debe_cambiar_password: true,
          }).eq('id', empleado.id)
        }
      } else {
        // Resetear password
        const res = await fetch('/api/staff/resetear-password', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email: empleado.email, password }),
        })
        if (res.ok) {
          await supabase.from('staff').update({
            password_temporal:     password,
            debe_cambiar_password: true,
          }).eq('id', empleado.id)
        }
      }

      // Enviar correo
      await fetch('/api/staff/correo-credenciales', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email:    empleado.email,
          nombre:   empleado.nombre,
          password,
          empleado,
        }),
      })

      setToast('Credenciales generadas y enviadas por correo')
      setTimeout(() => setToast(''), 3000)
      onRefresh()
    } catch (e) {
      setToast('Error al generar credenciales')
    }
    setLoading(false)
  }

  return (
    <div className="px-6 py-5 space-y-5">

      {toast && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm font-bold text-emerald-700">
          ✓ {toast}
        </div>
      )}

      {/* Estado de acceso */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <p className="text-sm font-black text-gray-800">Estado de acceso al CRM</p>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${tieneAcceso ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              <span className="text-sm text-gray-700">Cuenta creada</span>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              tieneAcceso ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
            }`}>
              {tieneAcceso ? 'Sí' : 'No'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${debeCambiar ? 'bg-amber-400' : 'bg-emerald-500'}`} />
              <span className="text-sm text-gray-700">Contraseña temporal</span>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              debeCambiar ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              {debeCambiar ? 'Pendiente cambio' : 'Ya cambió'}
            </span>
          </div>
        </div>
      </div>

      {/* Credenciales */}
      {tieneAcceso && passTemp && (
        <div className="border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-black text-gray-800">Credenciales actuales</p>
            <button onClick={() => setMostrarPass(p => !p)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              {mostrarPass ? <EyeOff size={12} /> : <Eye size={12} />}
              {mostrarPass ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          <div className="px-4 py-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Usuario</span>
              <span className="text-sm font-bold text-gray-700">{empleado.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Contraseña temporal</span>
              <span className="text-sm font-bold text-gray-700 font-mono">
                {mostrarPass ? passTemp : '••••••••••'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Botón generar */}
      <button
        onClick={handleGenerarCredenciales}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition"
        style={{ backgroundColor: '#171B24' }}>
        {loading
          ? <><RefreshCw size={14} className="animate-spin" /> Generando...</>
          : tieneAcceso
            ? <><KeyRound size={14} /> Resetear contraseña y reenviar correo</>
            : <><Mail size={14} /> Generar credenciales y enviar correo</>
        }
      </button>

      <p className="text-xs text-gray-400 text-center">
        Se enviará un correo a <strong>{empleado.email}</strong> con las credenciales de acceso
      </p>
    </div>
  )
}