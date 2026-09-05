'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { MODULE_PERMISSIONS, ModuleName } from '@/config/permissions'

interface AuthContextType {
  user: any
  staff: any
  role: string | null
  loading: boolean
  hasPermission: (allowedRoles: string[]) => boolean
  canAccess: (module: ModuleName) => boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  staff: null,
  role: null,
  loading: true,
  hasPermission: () => false,
  canAccess: () => false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [staff, setStaff] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const fetchStaff = async (userId: string) => {
      const { data: staffData, error } = await supabase
        .from('staff')
        .select('*, sucursales:sucursal_asignada_id(*)')
        .eq('supabase_user_id', userId)
        .maybeSingle()

      if (isMounted && staffData) {
        setStaff(staffData)
      }
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return

      if (session?.user) {
        setUser(session.user)
        await fetchStaff(session.user.id)
      } else {
        setUser(null)
        setStaff(null)
      }
      
      setLoading(false)
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  const role = staff?.tipo || null

  const hasPermission = (allowedRoles: string[]) => {
    if (!role) return false
    return allowedRoles.includes(role)
  }

  const canAccess = (module: ModuleName) => {
    if (!role) return false
    const allowed = MODULE_PERMISSIONS[module] || []
    return allowed.includes(role as any)
  }

  return (
    <AuthContext.Provider value={{ user, staff, role, loading, hasPermission, canAccess }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)