// app/dashboard/staff/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSucursal } from '@/context/SucursalContext'
import { Upload, Plus, RefreshCw } from 'lucide-react'
import StaffMetricas      from '../../../components/staff/StaffMetricas'
import StaffTabla         from '../../../components/staff/StaffTabla'
import DrawerNuevoEmpleado from '../../../components/staff/DrawerNuevoEmpleado'
import DrawerEditarEmpleado from '@/components/staff/DrawerEditarEmpleado'
import DrawerStaff from '@/components/staff/drawer/DrawerStaff'

export default function StaffPage() {
  const { sucursalId, sucursalActiva } = useSucursal()

  const [staff,      setStaff]      = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [nuevoOpen,  setNuevoOpen]  = useState(false)
  const [editarEmpleado, setEditarEmpleado] = useState<any | null>(null)
  const [editarOpen, setEditarOpen] = useState(false)
  const [drawerStaffId, setDrawerStaffId] = useState<string | null>(null)
  const [drawerOpen,    setDrawerOpen]    = useState(false)


const coaches        = staff.filter(s => s.tipo === 'Coach' && s.estatus === 'Activo').length
const staffOperativo = staff.filter(s => s.tipo !== 'Coach' && s.estatus === 'Activo').length
const bonos = staff.reduce((acc, s) => acc + (s.bono_periodo || 0), 0)
    
  const fetchStaff = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('staff')
      .select('*, staff_sucursales(sucursales(id, nombre, color))')
      .order('created_at', { ascending: false })

    if (!error && data) {
      const filtrado = sucursalId
        ? data.filter(st =>
            st.staff_sucursales?.some((ss: any) => ss.sucursales?.id === sucursalId)
          )
        : data
      setStaff(filtrado)
    }
    setLoading(false)
  }

  useEffect(() => { fetchStaff() }, [sucursalId])

  // ── Métricas ──────────────────────────────────────────────────────────────────
  const totalActivo      = staff.filter(s => s.estatus === 'Activo').length
  const horasTrabajadas  = 0   // pendiente check-in
  const clasesImpartidas = 0   // pendiente check-in
  const nominaPeriodo    = staff
    .filter(s => s.estatus === 'Activo')
    .reduce((acc, s) => acc + (s.sueldo_fijo || 0), 0)

  // ── Exportar CSV ──────────────────────────────────────────────────────────────
  const handleExportar = () => {
    const headers = ['Nombre', 'Email', 'Tipo', 'Nivel', 'Estatus', 'Sueldo', 'Ingreso']
    const rows = staff.map(s => [
      `${s.nombre} ${s.primer_apellido || ''} ${s.segundo_apellido || ''}`.trim(),
      s.email || '',
      s.tipo || '',
      s.nivel || '',
      s.estatus || '',
      s.sueldo_fijo || 0,
      s.fecha_ingreso || '',
    ])
    const csv  = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `staff-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
      <RefreshCw size={16} className="animate-spin" /> Cargando staff...
    </div>
  )

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Staff</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Gestión de equipo y rendimiento
            {sucursalActiva && ` · ${sucursalActiva.nombre}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportar}
            className="flex items-center gap-2 border border-gray-200 bg-white text-gray-700 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-gray-50 transition">
            <Upload size={15} /> Exportar
          </button>
          <button onClick={() => setNuevoOpen(true)}
            className="flex items-center gap-2 btn-dark font-bold text-sm px-4 py-2.5 rounded-xl transition">
            <Plus size={15} /> Nuevo empleado
          </button>
        </div>
      </div>

      {/* Métricas */}
      <StaffMetricas
        totalActivo={totalActivo}
        coaches={coaches}
        staffOperativo={staffOperativo}
        horasTrabajadas={horasTrabajadas}
        clasesImpartidas={clasesImpartidas}
        nominaPeriodo={nominaPeriodo}
        bonos={bonos}
      />

      {/* Tabla */}
      <StaffTabla
        staff={staff}
        onEditar={(s) => {
          setEditarEmpleado(s)
          setEditarOpen(true)
        }}
        onVer={(s) => { setDrawerStaffId(s.id); setDrawerOpen(true) }}
      />

      {/* Drawer nuevo */}
      <DrawerNuevoEmpleado
        isOpen={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        onSuccess={fetchStaff}
      />
      
      <DrawerEditarEmpleado
        isOpen={editarOpen}
        empleado={editarEmpleado}
        onClose={() => { setEditarOpen(false); setEditarEmpleado(null) }}
        onSuccess={() => { fetchStaff(); setEditarOpen(false); setEditarEmpleado(null) }}
      />
      
      <DrawerStaff
        staffId={drawerStaffId}
        isOpen={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerStaffId(null) }}
        onEditar={(empleado) => {
          setDrawerOpen(false)
          setEditarEmpleado(empleado)
          setEditarOpen(true)
        }}
      />
    </div>
  )
}