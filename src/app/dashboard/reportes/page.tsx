'use client'
import { useEffect, useState }      from 'react'
import { supabase }                 from '@/lib/supabase'
import { RefreshCw }                from 'lucide-react'
import ReportesMetricas             from '@/components/reportes/ReportesMetricas'
import ReportesSucursalCard         from '@/components/reportes/ReportesSucursalCard'
import ReportesGrafica              from '@/components/reportes/ReportesGrafica'
import * as XLSX                    from 'xlsx'
import jsPDF                        from 'jspdf'
import autoTable                    from 'jspdf-autotable'

export default function ReportesPage() {
  const [sucursales,  setSucursales]  = useState<any[]>([])
  const [periodos,    setPeriodos]    = useState<any[]>([])
  const [nominas,     setNominas]     = useState<any[]>([])
  const [clases,      setClases]      = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [periodoId,   setPeriodoId]   = useState<string>('')

  const fetchData = async () => {
    setLoading(true)
    const [
      { data: sucs },
      { data: pers },
    ] = await Promise.all([
      supabase.from('sucursales').select('id, nombre, color').eq('estatus', 'Activa').order('nombre'),
      supabase.from('nomina_periodos').select('*').order('fecha_inicio', { ascending: false }),
    ])

    if (sucs)  setSucursales(sucs)
    if (pers)  {
      setPeriodos(pers)
      if (!periodoId && pers.length > 0) setPeriodoId(pers[0].id)
    }
    setLoading(false)
  }

  const fetchNominas = async () => {
    if (!periodoId) return
    const { data } = await supabase
      .from('nomina_empleados')
      .select('*, staff(nombre, primer_apellido, tipo, nivel, sueldo_fijo, tarifa_hora)')
      .eq('periodo_id', periodoId)
    if (data) setNominas(data)

    // Clases del período
    const periodo = periodos.find(p => p.id === periodoId)
    if (periodo) {
      const { data: cls } = await supabase
        .from('clases')
        .select('id, sucursal_id, coach_id')
        .gte('horario', periodo.fecha_inicio)
        .lte('horario', periodo.fecha_fin)
      if (cls) setClases(cls)
    }
  }

  useEffect(() => { fetchData() }, [])
  useEffect(() => { fetchNominas() }, [periodoId])

  // Métricas globales
  const nominaTotal    = nominas.reduce((acc, n) => acc + (n.total || 0), 0)
  const horasTotales   = nominas.reduce((acc, n) => acc + (n.horas || 0), 0)
  const totalEmpleados = nominas.length
  const costoPorClase  = clases.length > 0 ? Math.round(nominaTotal / clases.length) : 0

  // Datos por sucursal
  const dataSucursal = (sucursalId: string) => {
    const nominasSuc = nominas.filter(n => n.sucursal_id === sucursalId)
    const clasesSuc  = clases.filter(c => c.sucursal_id === sucursalId)
    return {
      nomina:    nominasSuc.reduce((acc, n) => acc + (n.total || 0), 0),
      horas:     nominasSuc.reduce((acc, n) => acc + (n.horas || 0), 0),
      clases:    clasesSuc.length,
      empleados: nominasSuc.length,
    }
  }

  // Datos para gráfica — últimos 6 meses
  const graficaData = periodos.slice(0, 6).reverse().map(p => ({
    mes:   p.nombre.replace(' Q1','').replace(' Q2',''),
    total: 0, // placeholder hasta tener datos históricos
  }))

  // Exportar Excel
  const handleExportarExcel = () => {
    const rows = nominas.map(n => ({
      'Empleado':   `${n.staff?.nombre} ${n.staff?.primer_apellido}`,
      'Tipo':       n.staff?.tipo,
      'Nivel':      n.staff?.nivel || '—',
      'Horas':      n.horas,
      'Pago base':  n.pago_base,
      'Total':      n.total,
      'Estatus':    n.estatus,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Nómina')
    const periodo = periodos.find(p => p.id === periodoId)
    XLSX.writeFile(wb, `nomina-${periodo?.nombre || 'reporte'}.xlsx`)
  }

  // Generar PDF
  const handleGenerarPDF = () => {
    const doc      = new jsPDF()
    const periodo  = periodos.find(p => p.id === periodoId)
    doc.setFontSize(16)
    doc.text(`Reporte de nómina — ${periodo?.nombre || ''}`, 14, 20)
    doc.setFontSize(10)
    doc.text(`Nómina total: $${nominaTotal.toLocaleString()}`, 14, 30)
    doc.text(`Total empleados: ${totalEmpleados}`, 14, 37)
    doc.text(`Horas totales: ${horasTotales}h`, 14, 44)

    autoTable(doc, {
      startY: 55,
      head: [['Empleado', 'Tipo', 'Horas', 'Pago base', 'Total', 'Estatus']],
      body: nominas.map(n => [
        `${n.staff?.nombre} ${n.staff?.primer_apellido}`,
        n.staff?.tipo || '—',
        n.horas || 0,
        `$${(n.pago_base || 0).toLocaleString()}`,
        `$${(n.total || 0).toLocaleString()}`,
        n.estatus,
      ]),
      styles:     { fontSize: 9 },
      headStyles: { fillColor: [23, 27, 36] },
    })

    doc.save(`nomina-${periodo?.nombre || 'reporte'}.pdf`)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
      <RefreshCw size={16} className="animate-spin" /> Cargando reportes...
    </div>
  )

  const periodoActual = periodos.find(p => p.id === periodoId)

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Reporte de nómina</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {periodoActual?.nombre} · Cierre quincenal del{' '}
            {periodoActual?.fecha_fin
              ? new Date(periodoActual.fecha_fin).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' })
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Selector período */}
          <select
            value={periodoId}
            onChange={e => setPeriodoId(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-700 bg-white outline-none focus:border-gray-400 appearance-none cursor-pointer">
            {periodos.map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>

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

      {/* Métricas */}
      <ReportesMetricas
        nominaTotal={nominaTotal}
        horasTotales={horasTotales}
        costoPorClase={costoPorClase}
        totalEmpleados={totalEmpleados}
      />

      {/* Grid sucursales */}
      <div className="grid grid-cols-2 gap-4">
        {sucursales.map(s => {
          const data = dataSucursal(s.id)
          return (
            <ReportesSucursalCard
              key={s.id}
              sucursal={s}
              periodo={periodoId}
              nomina={data.nomina}
              horas={data.horas}
              clases={data.clases}
              empleados={data.empleados}
            />
          )
        })}
      </div>

      {/* Gráfica */}
      <ReportesGrafica data={graficaData} />
    </div>
  )
}