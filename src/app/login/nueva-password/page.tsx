'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AuthCard  from '@/components/auth/AuthCard'
import AuthLogo  from '@/components/auth/AuthLogo'
import AuthInput from '@/components/auth/AuthInput'
import { CheckCircle2, XCircle } from 'lucide-react'

type Estado = 'idle' | 'loading' | 'success' | 'error' | 'link-invalido'

function RequisitoClave({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${ok ? 'text-green-600' : 'text-gray-400'}`}>
      {ok ? <CheckCircle2 size={12}/> : <XCircle size={12}/>}
      {texto}
    </div>
  )
}

export default function NuevaPasswordPage() {
  const router  = useRouter()
  const [pass,    setPass]    = useState('')
  const [confirm, setConfirm] = useState('')
  const [estado,  setEstado]  = useState<Estado>('idle')
  const [error,   setError]   = useState('')
  const [sesionOk, setSesionOk] = useState(false)

  // Verificar que haya sesión activa (viene del link de email)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSesionOk(true)
      else setEstado('link-invalido')
    })
  }, [])

  // Validaciones
  const tieneMinimo  = pass.length >= 8
  const tieneMayuscula = /[A-Z]/.test(pass)
  const tieneNumero    = /[0-9]/.test(pass)
  const coinciden      = pass === confirm && confirm !== ''
  const valida         = tieneMinimo && tieneMayuscula && tieneNumero && coinciden

  const handleGuardar = async () => {
    if (!valida) return
    setEstado('loading')
    setError('')

    const { error: err } = await supabase.auth.updateUser({ password: pass })

    if (err) {
      setError('No se pudo actualizar la contraseña. El enlace puede haber expirado.')
      setEstado('error')
    } else {
      setEstado('success')
      setTimeout(() => router.push('/login'), 3000)
    }
  }

  // ── Link inválido ──
  if (estado === 'link-invalido') return (
    <AuthCard>
      <AuthLogo />
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <XCircle size={28} className="text-red-500"/>
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900">Enlace inválido</h2>
          <p className="text-gray-500 text-sm mt-2">
            Este enlace expiró o ya fue utilizado. Solicita uno nuevo.
          </p>
        </div>
        <Link href="/login/recuperar"
          className="block w-full bg-gray-900 text-white font-bold py-3.5 rounded-xl text-sm text-center hover:bg-gray-800 transition">
          Solicitar nuevo enlace
        </Link>
        <Link href="/login" className="block text-xs text-gray-400 hover:text-gray-700 transition">
          Volver al inicio de sesión
        </Link>
      </div>
    </AuthCard>
  )

  // ── Éxito ──
  if (estado === 'success') return (
    <AuthCard>
      <AuthLogo />
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 size={28} className="text-green-600"/>
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900">¡Contraseña actualizada!</h2>
          <p className="text-gray-500 text-sm mt-2">
            Tu contraseña fue cambiada exitosamente. Redirigiendo al login...
          </p>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div className="bg-green-500 h-1.5 rounded-full animate-[width_3s_ease-in-out]" style={{ width: '100%' }} />
        </div>
        <Link href="/login"
          className="block text-sm text-indigo-600 hover:text-indigo-800 font-bold transition">
          Ir al login ahora →
        </Link>
      </div>
    </AuthCard>
  )

  return (
    <AuthCard>
      <AuthLogo />

      <div className="text-center mb-7">
        <h1 className="text-2xl font-black text-gray-900">Nueva contraseña</h1>
        <p className="text-gray-500 text-sm mt-1">Elige una contraseña segura para tu cuenta.</p>
      </div>

      <div className="space-y-4">
        <AuthInput
          label="Nueva contraseña"
          type="password"
          placeholder="••••••••"
          value={pass}
          onChange={e => { setPass(e.target.value); setError('') }}
        />

        {/* Requisitos */}
        {pass && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1.5">
            <RequisitoClave ok={tieneMinimo}    texto="Mínimo 8 caracteres" />
            <RequisitoClave ok={tieneMayuscula} texto="Al menos una mayúscula" />
            <RequisitoClave ok={tieneNumero}    texto="Al menos un número" />
          </div>
        )}

        <AuthInput
          label="Confirmar contraseña"
          type="password"
          placeholder="••••••••"
          value={confirm}
          onChange={e => { setConfirm(e.target.value); setError('') }}
          error={confirm && !coinciden ? 'Las contraseñas no coinciden' : undefined}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">
            ❌ {error}
          </div>
        )}

        <button
          onClick={handleGuardar}
          disabled={!valida || estado === 'loading' || !sesionOk}
          className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3.5 rounded-xl text-sm transition disabled:opacity-40"
        >
          {estado === 'loading' ? 'Guardando...' : 'Guardar nueva contraseña'}
        </button>

        <Link href="/login"
          className="block text-center text-xs text-gray-400 hover:text-gray-700 transition">
          Cancelar y volver al login
        </Link>
      </div>
    </AuthCard>
  )
}