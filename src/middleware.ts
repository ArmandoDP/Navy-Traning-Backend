import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_ROUTES = [
  '/login',
  '/login/recuperar',
  '/login/nueva-password',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Permitir assets y api
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/icons') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Permitir rutas públicas
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // Verificar sesión — Supabase v2 guarda el token así
  const allCookies = [...request.cookies.getAll()]
  const token = allCookies.find(c =>
    c.name.includes('auth-token') ||
    c.name.includes('access-token') ||
    c.name.startsWith('sb-')
  )?.value

  // Si está en raíz y tiene sesión → dashboard
  if (pathname === '/') {
    if (token) return NextResponse.redirect(new URL('/dashboard/ejecutivo', request.url))
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Si intenta entrar al dashboard sin sesión → login
  if (!token && pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Si ya tiene sesión e intenta ir al login → dashboard
  if (token && PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL('/dashboard/ejecutivo', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images|icons).*)',
  ],
}