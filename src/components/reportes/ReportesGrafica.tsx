'use client'
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'

interface Props {
  data: { mes: string; total: number }[]
}

export default function ReportesGrafica({ data }: Props) {
  if (data.length === 0) return null

  const maxVal  = Math.max(...data.map(d => d.total))
  const promedio = Math.round(data.reduce((acc, d) => acc + d.total, 0) / data.length)
  const pico     = data.reduce((a, b) => a.total > b.total ? a : b)
  const primero  = data[0]?.total || 0
  const ultimo   = data[data.length - 1]?.total || 0
  const crecimiento = primero > 0 ? Math.round(((ultimo - primero) / primero) * 100) : 0

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
      <div className="mb-4">
        <p className="text-sm font-black text-gray-900">Tendencia de nómina</p>
        <p className="text-xs text-gray-400">Por mes últ. 6 meses</p>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} barSize={40} barCategoryGap="20%">
          <XAxis
            dataKey="mes"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              fontSize: 12,
            }}
            formatter={(v: any) => [`$${Number(v).toLocaleString()}`, 'Nómina']}
          />
          <Bar dataKey="total" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.total === maxVal ? '#171B24' : '#e5e7eb'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Stats de la gráfica */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <div>
          <p className="text-xs text-gray-400">Promedio</p>
          <p className="text-sm font-black text-gray-900">${promedio.toLocaleString()}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400">Crecimiento 6m</p>
          <p className={`text-sm font-black ${crecimiento >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
            {crecimiento >= 0 ? '+' : ''}{crecimiento}%
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Pico</p>
          <p className="text-sm font-black text-gray-900">
            ${pico.total.toLocaleString()} ({pico.mes})
          </p>
        </div>
      </div>
    </div>
  )
}