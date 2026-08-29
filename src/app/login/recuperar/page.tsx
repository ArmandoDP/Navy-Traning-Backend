'use client'
import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AuthCard  from '@/components/auth/AuthCard'
import AuthLogo  from '@/components/auth/AuthLogo'
import AuthInput from '@/components/auth/AuthInput'
import AuthToast from '@/components/auth/AuthToast'
import { ArrowLeft } from 'lucide-react'

type Estado = 'idle' | 'loading' | 'enviado' | 'error'

export default function RecuperarPage() {
    const [email, setEmail] = useState('')
    const [estado, setEstado] = useState<Estado>('idle')
    const [error, setError] = useState('')

    const handleEnviar = async () => {
        if (!email) { setError('Ingresa tu correo electrónico.'); return }
        setEstado('loading')
        setError('')

        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/login/nueva-password`,
        })

        if (err) {
            setError('No encontramos una cuenta con ese correo.')
            setEstado('error')
        } else {
            setEstado('enviado')
        }

        return (
            <AuthCard>
                {/* Toast verde cuando se envía el correo */}
                {estado === 'enviado' && (
                    <AuthToast
                        mensaje="Se ha enviado un correo con la información para iniciar sesión."
                        tipo="success"
                        onClose={() => setEstado('idle')}
                        duracion={0}
                    />
                )}

                <AuthLogo />

                <div className="text-center mb-7">
                    <h1 className="text-2xl font-black text-gray-900">Recuperar contraseña</h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
                    </p>
                </div>

                <div className="space-y-4">
                    <AuthInput
                        label="Correo electrónico"
                        type="email"
                        placeholder="tucorreo@ejemplo.com"
                        value={email}
                        onChange={e => { setEmail(e.target.value); setError('') }}
                        error={error || undefined}
                        onKeyDown={e => e.key === 'Enter' && handleEnviar()}
                    />

                    <button
                        onClick={handleEnviar}
                        disabled={estado === 'loading' || estado === 'enviado'}
                        className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3.5 rounded-xl text-sm transition disabled:opacity-60"
                    >
                        {estado === 'loading' ? 'Enviando...' : estado === 'enviado' ? '¡Enviado!' : 'Enviar enlace'}
                    </button>

                    <Link href="/login"
                        className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition">
                        <ArrowLeft size={14} /> Volver al inicio de sesión
                    </Link>
                </div>
            </AuthCard>
        )
    }
}