'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AuthCard  from '@/components/auth/AuthCard'
import AuthLogo  from '@/components/auth/AuthLogo'
import AuthInput from '@/components/auth/AuthInput'
import AuthToast from '@/components/auth/AuthToast'

type ToastInfo = { mensaje: string; tipo: 'error' | 'warning' | 'success' } | null

export default function LoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [toast,    setToast]    = useState<ToastInfo>(null)
  const [errorCampo, setErrorCampo] = useState<'correo'|'contrasena'|null>(null)

  const handleLogin = async () => {
    setErrorCampo(null)
    if (!email)    { setErrorCampo('correo');     return }
    if (!password) { setErrorCampo('contrasena'); return }

    setLoading(true)
    setToast(null)

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      const msg = authError.message.toLowerCase()
      if (msg.includes('email'))         setErrorCampo('correo')
      else if (msg.includes('password')) setErrorCampo('contrasena')
      else setToast({ mensaje: 'No se encontraron las credenciales ingresadas. Intente de nuevo.', tipo: 'error' })
      setLoading(false)
      return
    }

    if (data.user) {
      // Verificar si es staff
      const { data: staff } = await supabase
        .from('staff')
        .select('id, estatus, debe_cambiar_password')
        .eq('email', email)
        .maybeSingle()

      if (staff) {
        if (staff.estatus === 'Inactivo') {
          await supabase.auth.signOut()
          setToast({ mensaje: 'Tu cuenta está inactiva. Contacta a tu manager.', tipo: 'warning' })
          setLoading(false)
          return
        }
        if (staff.debe_cambiar_password) {
          router.push(`/login/cambiar-password?staffId=${staff.id}`)
          return
        }
        router.push('/dashboard/ejecutivo')
        return
      }

      // Verificar si es admin/cliente normal
      const { data: perfil } = await supabase
        .from('clientes').select('estatus').eq('id', data.user.id).single()
      if (perfil?.estatus === 'Inactivo' || perfil?.estatus === 'Vencido') {
        await supabase.auth.signOut()
        setToast({ mensaje: 'Este usuario se ha dado de baja. Intente de nuevo.', tipo: 'warning' })
        setLoading(false)
        return
      }

      router.push('/dashboard/ejecutivo')
    }
  }

  return (
    <AuthCard>
      {toast && <AuthToast mensaje={toast.mensaje} tipo={toast.tipo} onClose={() => setToast(null)} />}

      <AuthLogo />
      <div className="text-center mb-7">
        <h1 className="text-2xl font-black text-gray-900">¡Hola!</h1>
        <p className="text-gray-500 text-sm mt-1">Por favor, ingresa tus datos</p>
      </div>

      <div className="space-y-4">
        <AuthInput
          label="Correo"
          type="email"
          placeholder="paola@gmail.com"
          value={email}
          onChange={e => { setEmail(e.target.value); setErrorCampo(null) }}
          error={errorCampo === 'correo' ? 'Ingresa un correo electrónico válido.' : undefined}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
        />
        <AuthInput
          label="Contraseña"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={e => { setPassword(e.target.value); setErrorCampo(null) }}
          error={errorCampo === 'contrasena' ? 'La contraseña es incorrecta.' : undefined}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
        />
        <div className="text-right -mt-1">
          <Link href="/login/recuperar" className="text-xs text-gray-500 hover:text-gray-900 transition">
            ¿No recuerdas tu contraseña? <span className="font-bold underline">Click aquí.</span>
          </Link>
        </div>
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3.5 rounded-xl text-sm transition disabled:opacity-60 mt-2"
        >
          {loading ? 'Verificando...' : 'Entrar'}
        </button>
      </div>
    </AuthCard>
  )
}