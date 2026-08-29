'use client'
import { useState } from 'react'
import { Download, Calendar } from 'lucide-react'
import FinanzasResumen       from '@/components/finanzas/FinanzasResumen'
import FinanzasIngresos      from '@/components/finanzas/FinanzasIngresos'
import FinanzasTransacciones from '@/components/finanzas/FinanzasTransacciones'
import FinanzasPagosFallidos from '@/components/finanzas/FinanzasPagosFallidos'
import FinanzasNomina from '@/components/finanzas/FinanzasNomina'
import { useSucursal } from '@/context/SucursalContext'

type Tab = 'resumen' | 'ingresos' | 'transacciones' | 'fallidos' | 'nomina'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'resumen',        label: 'Resumen',          icon: '▦' },
  { key: 'ingresos',       label: 'Ingresos · Detalle', icon: '↗' },
  { key: 'transacciones',  label: 'Transacciones',    icon: '▤' },
  { key: 'fallidos',       label: 'Pagos fallidos',   icon: '⚠' },
  { key: 'nomina',         label: 'Nómina coaches',   icon: '▤' },
]

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]

export default function FinanzasPage() {
  const [tab,   setTab]   = useState<Tab>('resumen')
  const [mes,   setMes]   = useState(new Date().getMonth())
  const [anio,  setAnio]  = useState(new Date().getFullYear())

  const fechaInicio = new Date(anio, mes, 1).toISOString().split('T')[0]
  const fechaFin    = new Date(anio, mes + 1, 0).toISOString().split('T')[0]
  const { sucursalId } = useSucursal()

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Finanzas</h1>
          <p className="text-gray-400 text-sm mt-0.5">Gestión de membresías y precios</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Selector mes */}
          <div className="flex items-center gap-2 border border-gray-200 bg-white rounded-xl px-3 py-2">
            <Calendar size={14} className="text-gray-400" />
            <select className="text-sm font-medium text-gray-700 outline-none bg-transparent"
              value={mes} onChange={e => setMes(Number(e.target.value))}>
              {MESES.map((m, i) => <option key={i} value={i}>{m} {anio}</option>)}
            </select>
          </div>
          <button className="flex items-center gap-2 bg-gray-900 text-white font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-gray-800 transition">
            <Download size={15} /> Exportar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-gray-200 rounded-2xl p-1 flex gap-1 shadow-sm">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition ${
              tab === t.key ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700'
            }`}>
            <span>{t.icon}</span>
            <span className="hidden md:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'resumen'       && <FinanzasResumen       fechaInicio={fechaInicio} fechaFin={fechaFin} sucursalId={sucursalId} />}
      {tab === 'ingresos'      && <FinanzasIngresos      fechaInicio={fechaInicio} fechaFin={fechaFin} />}
      {tab === 'transacciones' && <FinanzasTransacciones fechaInicio={fechaInicio} fechaFin={fechaFin} sucursalId={sucursalId} />}
      {tab === 'fallidos'      && <FinanzasPagosFallidos fechaInicio={fechaInicio} fechaFin={fechaFin} sucursalId={sucursalId} />}
      {tab === 'nomina'        && <FinanzasNomina        fechaInicio={fechaInicio} fechaFin={fechaFin} sucursalId={sucursalId} />}
    </div>
  )
}