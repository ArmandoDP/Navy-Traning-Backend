'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AuthCard  from '@/components/auth/AuthCard'
import AuthLogo  from '@/components/auth/AuthLogo'
import AuthInput from '@/components/auth/AuthInput'

function CambiarPasswordContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const staffId      = searchParams.get('staffId')

  const [password,  setPassword]  = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  const handleCambiar = async () => {
    setError('')
    if (!password || password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)

    const { error: authError } = await supabase.auth.updateUser({ password })
    if (authError) {
      setError('Error al cambiar la contraseña. Intenta de nuevo.')
      setLoading(false)
      return
    }

    if (staffId) {
      await supabase.from('staff').update({
        debe_cambiar_password: false,
        password_temporal:     null,
      }).eq('id', staffId)
    }

    router.push('/dashboard/ejecutivo')
  }

  return (
    <AuthCard>
      <AuthLogo />
      <div className="text-center mb-7">
        <h1 className="text-2xl font-black text-gray-900">Cambia tu contraseña</h1>
        <p className="text-gray-500 text-sm mt-1">
          Es tu primer acceso. Por seguridad debes establecer una nueva contraseña.
        </p>
      </div>

      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">
            {error}
          </div>
        )}

        <AuthInput
          label="Nueva contraseña"
          type="password"
          placeholder="Mínimo 8 caracteres"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <AuthInput
          label="Confirmar contraseña"
          type="password"
          placeholder="Repite tu contraseña"
          value={confirmar}
          onChange={e => setConfirmar(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCambiar()}
        />

        <button
          onClick={handleCambiar}
          disabled={loading}
          className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3.5 rounded-xl text-sm transition disabled:opacity-60 mt-2">
          {loading ? 'Guardando...' : 'Establecer contraseña →'}
        </button>
      </div>
    </AuthCard>
  )
}

export default function CambiarPasswordPage() {
  return (
    <Suspense fallback={null}>
      <CambiarPasswordContent />
    </Suspense>
  )
}