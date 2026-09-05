'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ConfirmarEmailPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    const handleConfirm = async () => {
      const hash   = window.location.hash
      const search = window.location.search
      const params = new URLSearchParams(hash.replace('#', '') || search)
      
      const type         = params.get('type')
      const accessToken  = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      // 1. Manejar Recuperación de Contraseña (Web / CRM / Localhost)
      if (type === 'recovery' || hash.includes('type=recovery')) {
        // Redirige directamente a la pantalla de cambiar contraseña en la Web/CRM
        router.replace(`/login/nueva-password${hash}`)
        return
      }

      // 2. Manejar Registro / Confirmación de Email (Signup)
      if (accessToken && (type === 'signup' || !type)) {
        const { error } = await supabase.auth.setSession({
          access_token:  accessToken,
          refresh_token: refreshToken || '',
        })
        if (error) { 
          setStatus('error')
          return 
        }
        setStatus('success')
        return
      }

      if (hash.includes('error')) {
        setStatus('error')
        return
      }

      setStatus('success')
    }

    handleConfirm()
  }, [router])

  if (status === 'loading') return (
    <div style={{ minHeight: '100vh', backgroundColor: '#171B24', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#fff', fontFamily: 'sans-serif' }}>Procesando solicitud...</p>
    </div>
  )

  if (status === 'error') return (
    <div style={{ minHeight: '100vh', backgroundColor: '#171B24', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#ef4444', fontSize: '24px', fontWeight: 900 }}>Link inválido</p>
        <p style={{ color: '#9ca3af' }}>El link expiró o ya fue usado.</p>
      </div>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#171B24',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'sans-serif',
      padding: '20px',
    }}>
      <div style={{
        backgroundColor: '#1f2937',
        borderRadius: '24px',
        padding: '48px 40px',
        maxWidth: '420px',
        width: '100%',
        textAlign: 'center',
      }}>
        <img 
          src="/logo-navy.svg" 
          alt="Navy Training Center" 
          style={{ width: '140px', display: 'block', margin: '0 auto 40px' }} 
        />

        <div style={{
          width: '72px', height: '72px', borderRadius: '50%',
          backgroundColor: '#22c55e',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          fontSize: '36px',
        }}>✓</div>

        <h1 style={{ color: '#fff', fontSize: '26px', fontWeight: 900, margin: '0 0 12px' }}>
          ¡Email confirmado!
        </h1>
        <p style={{ color: '#9ca3af', fontSize: '15px', lineHeight: '24px', margin: '0 0 40px' }}>
          Tu cuenta está activa. Inicia sesión con tu correo y contraseña.
        </p>

        <a href="/login"
          style={{
            display: 'block',
            backgroundColor: '#fff',
            color: '#111',
            fontWeight: 900,
            fontSize: '16px',
            padding: '18px',
            borderRadius: '16px',
            textDecoration: 'none',
          }}>
          Ir al Inicio de Sesión →
        </a>
      </div>
    </div>
  )
}