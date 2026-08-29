'use client'
import { useEffect, useState }   from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { supabase }              from '@/lib/supabase'
import { RefreshCw, ArrowLeft }  from 'lucide-react'
import Link                      from 'next/link'
import DetalleMetricas           from '@/components/reportes/detalle/DetalleMetricas'
import DetalleTipoEmpleado       from '@/components/reportes/detalle/DetalleTipoEmpleado'
import DetalleEmpleados          from '@/components/reportes/detalle/DetalleEmpleados'
import * as XLSX                 from 'xlsx'
import jsPDF                     from 'jspdf'
import autoTable                 from 'jspdf-autotable'

export default function ReporteDetallePage() {
  const { sucursalId } = useParams()
  const searchParams   = useSearchParams()
  const periodoId      = searchParams.get('periodo') || ''

  const [sucursal,    setSucursal]    = useState<any>(null)
  const [periodo,     setPeriodo]     = useState<any>(null)
  const [nominas,     setNominas]     = useState<any[]>([])
  const [clases,      setClases]      = useState<any[]>([])
  const [nominaTotal, setNominaTotal] = useState(0)
  const [loading,     setLoading]     = useState(true)

  const fetchData = async () => {
    setLoading(true)
    const [
      { data: suc },
      { data: per },
    ] = await Promise.all([
      supabase.from('sucursales').select('*').eq('id', sucursalId).single(),
      supabase.from('nomina_periodos').select('*').eq('id', periodoId).single(),
    ])
    if (suc) setSucursal(suc)
    if (per) setPeriodo(per)

    // Nómina de esta sucursal
    const { data: noms } = await supabase
      .from('nomina_empleados')
      .select('*, staff(nombre, primer_apellido, tipo, nivel, sueldo_fijo, tarifa_hora)')
      .eq('periodo_id', periodoId)
      .eq('sucursal_id', sucursalId)
      .order('total', { ascending: false })
    if (noms) setNominas(noms)

    // Clases del período en esta sucursal
    if (per) {
      const { data: cls } = await supabase
        .from('clases')
        .select('id, coach_id')
        .eq('sucursal_id', sucursalId)
        .gte('horario', per.fecha_inicio)
        .lte('horario', per.fecha_fin)
      if (cls) setClases(cls)
    }

    // Nómina total de la empresa para calcular %
    const { data: allNoms } = await supabase
      .from('nomina_empleados')
      .select('total')
      .eq('periodo_id', periodoId)
    if (allNoms) setNominaTotal(allNoms.reduce((acc, n) => acc + (n.total || 0), 0))

    setLoading(false)
  }

  useEffect(() => { if (periodoId) fetchData() }, [sucursalId, periodoId])

  // Métricas
  const nominaSucursal = nominas.reduce((acc, n) => acc + (n.total || 0), 0)
  const horasTotales   = nominas.reduce((acc, n) => acc + (n.horas || 0), 0)
  const costoPorClase  = clases.length > 0 ? Math.round(nominaSucursal / clases.length) : 0

  // Desglose por tipo
  const filasTipo = Object.entries(
    nominas.reduce((acc: Record<string, any>, n) => {
      const tipo = n.staff?.tipo || 'Sin tipo'
      if (!acc[tipo]) acc[tipo] = { tipo, personas: 0, horas: 0, pagoBase: 0, total: 0 }
      acc[tipo].personas++
      acc[tipo].horas    += n.horas    || 0
      acc[tipo].pagoBase += n.pago_base || 0
      acc[tipo].total    += n.total    || 0
      return acc
    }, {})
  ).map(([, v]: [string, any]) => ({
    ...v,
    pctNomina: nominaSucursal > 0 ? (v.total / nominaSucursal) * 100 : 0,
  })).sort((a, b) => b.total - a.total)

  // Agregar clases_count a cada nómina
  const nominasConClases = nominas.map(n => ({
    ...n,
    clases_count: clases.filter(c => c.coach_id === n.staff_id).length || null,
    pago_base:    n.pago_base || n.staff?.sueldo_fijo || 0,
  }))

  // Exportar Excel
  const handleExportarExcel = () => {
    const rows = nominas.map(n => ({
      'Empleado':  `${n.staff?.nombre} ${n.staff?.primer_apellido}`,
      'Tipo':      n.staff?.tipo,
      'Nivel':     n.staff?.nivel || '—',
      'Horas':     n.horas,
      'Pago base': n.pago_base,
      'Total':     n.total,
      'Estatus':   n.estatus,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Nómina')
    XLSX.writeFile(wb, `nomina-${sucursal?.nombre}-${periodo?.nombre}.xlsx`)
  }

  // Generar PDF
  const handleGenerarPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text(`${sucursal?.nombre} — ${periodo?.nombre}`, 14, 20)
    doc.setFontSize(10)
    doc.text(`Nómina sucursal: $${nominaSucursal.toLocaleString()}`, 14, 30)
    doc.text(`Empleados: ${nominas.length}`, 14, 37)
    doc.text(`Horas: ${horasTotales}h`, 14, 44)

    autoTable(doc, {
      startY: 55,
      head:   [['Empleado', 'Tipo', 'Nivel', 'Horas', 'Total', 'Estatus']],
      body:   nominas.map(n => [
        `${n.staff?.nombre} ${n.staff?.primer_apellido}`,
        n.staff?.tipo || '—',
        n.staff?.nivel || '—',
        n.horas || 0,
        `$${(n.total || 0).toLocaleString()}`,
        n.estatus,
      ]),
      styles:     { fontSize: 9 },
      headStyles: { fillColor: [23, 27, 36] },
    })

    doc.save(`nomina-${sucursal?.nombre}-${periodo?.nombre}.pdf`)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
      <RefreshCw size={16} className="animate-spin" /> Cargando reporte...
    </div>
  )

  return (
    <div className="space-y-5">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/dashboard/reportes"
          className="flex items-center gap-1 hover:text-gray-700 transition">
          <ArrowLeft size={14} /> Reportes
        </Link>
        <span>›</span>
        <span>{periodo?.nombre}</span>
        <span>›</span>
        <span className="font-bold text-gray-700">{sucursal?.nombre}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: sucursal?.color || '#6b7280' }} />
          <h1 className="text-xl font-black text-gray-900">
            {sucursal?.nombre} — {periodo?.nombre}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportarExcel}
            className="flex items-center gap-2 border border-gray-200 bg-white text-gray-700 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-gray-50 transition">
            📊 Exportar excel
          </button>
          <button onClick={handleGenerarPDF}
            className="flex items-center gap-2 font-bold text-sm px-4 py-2.5 rounded-xl text-white transition"
            style={{ backgroundColor: '#171B24' }}>
            📄 Generar pdf
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-400 -mt-3">Reporte detallado de nómina y operación</p>

      {/* Métricas */}
      <DetalleMetricas
        nominaSucursal={nominaSucursal}
        empleados={nominas.length}
        horasTrabajadas={horasTotales}
        costoPorClase={costoPorClase}
        totalEmpresa={nominaTotal}
      />

      {/* Desglose por tipo */}
      <DetalleTipoEmpleado filas={filasTipo} />

      {/* Desglose por empleado */}
      <DetalleEmpleados
        empleados={nominasConClases}
        periodoId={periodoId}
        onRefresh={fetchData}
      />
    </div>
  )
}