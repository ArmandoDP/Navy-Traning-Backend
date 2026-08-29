'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Sucursal {
  id:     string
  nombre: string
  ciudad: string
  color:  string
}

interface SucursalContextType {
  sucursales:          Sucursal[]
  sucursalActiva:      Sucursal | null   // null = Global (todas)
  setSucursalActiva:   (s: Sucursal | null) => void
  sucursalId:          string | null     // shorthand para queries
}

// ─── Context ──────────────────────────────────────────────────────────────────
const SucursalContext = createContext<SucursalContextType>({
  sucursales:        [],
  sucursalActiva:    null,
  setSucursalActiva: () => {},
  sucursalId:        null,
})

// ─── Provider ─────────────────────────────────────────────────────────────────
export function SucursalProvider({ children }: { children: ReactNode }) {
  const [sucursales,       setSucursales]       = useState<Sucursal[]>([])
  const [sucursalActiva,   setSucursalActiva]   = useState<Sucursal | null>(null)

  useEffect(() => {
    supabase
      .from('sucursales')
      .select('id, nombre, ciudad, color')
      .eq('estatus', 'Activa')
      .order('nombre')
      .then(({ data }) => { if (data) setSucursales(data) })
  }, [])

  return (
    <SucursalContext.Provider value={{
      sucursales,
      sucursalActiva,
      setSucursalActiva,
      sucursalId: sucursalActiva?.id ?? null,
    }}>
      {children}
    </SucursalContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSucursal() {
  return useContext(SucursalContext)
}