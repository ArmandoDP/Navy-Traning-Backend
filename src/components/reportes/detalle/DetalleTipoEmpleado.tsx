'use client'

interface FilaTipo {
  tipo:      string
  personas:  number
  horas:     number
  pagoBase:  number
  total:     number
  pctNomina: number
}

interface Props {
  filas: FilaTipo[]
}

const TIPO_COLORS: Record<string, string> = {
  'Coach':         '#6366f1',
  'Manager':       '#10b981',
  'Submanager':    '#14b8a6',
  'Regional':      '#8b5cf6',
  'Front':         '#ec4899',
  'Staff general': '#6b7280',
  'Limpieza':      '#f97316',
  'Mantto':        '#f59e0b',
}

function hexSoftBg(hex: string) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},0.12)`
}

export default function DetalleTipoEmpleado({ filas }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <p className="text-sm font-black text-gray-900">Desglose por tipo de empleado</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-gray-400 text-[11px] font-bold uppercase border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Personas</th>
              <th className="px-5 py-3">Horas</th>
              <th className="px-5 py-3">Pago base</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">% Nómina</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-gray-400 italic text-sm">
                  Sin datos para este período
                </td>
              </tr>
            ) : filas.map(f => {
              const color = TIPO_COLORS[f.tipo] || '#6b7280'
              return (
                <tr key={f.tipo} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold"
                      style={{ color, backgroundColor: hexSoftBg(color) }}>
                      {f.tipo}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm font-bold text-gray-800">{f.personas}</td>
                  <td className="px-5 py-3 text-sm text-gray-700">{f.horas > 0 ? `${f.horas}h` : '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-700">${f.pagoBase.toLocaleString()}</td>
                  <td className="px-5 py-3 text-sm font-bold text-gray-900">${f.total.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-400"
                          style={{ width: `${Math.min(f.pctNomina, 100)}%` }} />
                      </div>
                      <span className={`text-xs font-bold ${
                        f.pctNomina > 50 ? 'text-indigo-600' : 'text-gray-500'
                      }`}>
                        {f.pctNomina.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}