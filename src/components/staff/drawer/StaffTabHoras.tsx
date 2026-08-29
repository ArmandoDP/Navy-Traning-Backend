'use client'
import { useState } from 'react'

interface Props { empleado: any }

export default function StaffTabHoras({ empleado }: Props) {
  const [tab, setTab] = useState<'registro' | 'ajuste' | 'anteriores'>('registro')

  return (
    <div className="px-6 py-5 space-y-4">

      {/* Resumen período */}
      <div className="bg-gray-50 rounded-2xl px-5 py-4">
        <p className="text-xs font-black text-gray-400 uppercase mb-3">Cálculo del período en curso</p>
        <div className="grid grid-cols-4 gap-3 text-center">
          {[
            { label: 'Período',        value: 'Abr 2026 Q2' },
            { label: 'Horas totales',  value: '80 h' },
            { label: 'Horas aprobadas',value: '80 h' },
            { label: 'Pendientes',     value: '0 h' },
          ].map(item => (
            <div key={item.label}>
              <p className="text-[10px] text-gray-400">{item.label}</p>
              <p className="text-sm font-black text-gray-800 mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
          Las horas se registran automáticamente por cada clase impartida. El gerente de sucursal valida ajustes manuales y aprueba al cierre de quincena.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1">
        {([
          { key: 'registro',    label: 'Registro diario' },
          { key: 'ajuste',      label: 'Ajuste manual' },
          { key: 'anteriores',  label: 'Períodos anteriores' },
        ] as { key: 'registro' | 'ajuste' | 'anteriores'; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              tab === t.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'registro' && (
        <div className="space-y-1">
          <div className="grid grid-cols-6 gap-2 px-3 py-2 text-[10px] font-bold text-gray-400 uppercase">
            <span className="col-span-1">Fecha</span>
            <span className="col-span-2">Detalle</span>
            <span className="col-span-1">Auto</span>
            <span className="col-span-1">Ajuste</span>
            <span className="col-span-1">Estado</span>
          </div>
          <div className="text-center text-gray-300 text-sm italic py-8">
            Disponible cuando se configure el check-in
          </div>
        </div>
      )}

      {tab === 'ajuste' && (
        <div className="bg-gray-50 rounded-2xl px-5 py-6 text-center space-y-3">
          <p className="text-sm font-bold text-gray-700">Solicitar ajuste manual</p>
          <p className="text-xs text-gray-400 max-w-xs mx-auto">
            El coach solicita un ajuste, el gerente lo aprueba o rechaza al cierre de quincena.
          </p>
          <button className="flex items-center gap-2 mx-auto px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 transition">
            + Agregar ajuste manual
          </button>
        </div>
      )}

      {tab === 'anteriores' && (
        <div className="space-y-2">
          {[
            { periodo: 'Abr 2026 Q1', fechas: '1-15 Abril', aprobado: '12 Abr', aprobador: 'Daniela Cárdenas', horas: 36 },
            { periodo: 'Mar 2026 Q2', fechas: '19-31 Marzo', aprobado: '31 Marzo', aprobador: 'Daniela Cárdenas', horas: 40 },
            { periodo: 'Mar 2026 Q1', fechas: '1-15 Marzo', aprobado: '15 Marzo', aprobador: 'Daniela Cárdenas', horas: 38 },
          ].map((p, i) => (
            <div key={i} className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-emerald-500 text-sm">✓</span>
                <div>
                  <p className="text-xs font-bold text-gray-800">{p.periodo}</p>
                  <p className="text-[11px] text-gray-400">
                    {p.fechas} · Aprobado {p.aprobado} · {p.aprobador}
                  </p>
                </div>
              </div>
              <p className="text-sm font-black text-gray-900">{p.horas} h</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}