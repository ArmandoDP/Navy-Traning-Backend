'use client'
import { useState }     from 'react'
import IntegracionCard  from './IntegracionCard'

type Categoria = 'todas' | 'pagos' | 'afiliacion' | 'salud'

const TABS: { key: Categoria; label: string; icon: string }[] = [
  { key: 'todas',      label: 'Todas',      icon: '⊙' },
  { key: 'pagos',      label: 'Pagos',      icon: '💳' },
  { key: 'afiliacion', label: 'Afiliación', icon: '🤝' },
  { key: 'salud',      label: 'Salud',      icon: '🩺' },
]

interface Props {
  integraciones: any[]
  onConectar:    (id: string) => void
  onDesconectar: (id: string) => void
}

export default function IntegracionesGrid({ integraciones, onConectar, onDesconectar }: Props) {
  const [tab, setTab] = useState<Categoria>('todas')

  const filtradas = tab === 'todas'
    ? integraciones
    : integraciones.filter(i => i.categoria === tab)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

      {/* Tabs */}
      <div className="grid grid-cols-4 border-b border-gray-100">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-medium transition border-b-2 ${
              tab === t.key
                ? 'border-gray-900 text-gray-900 font-bold'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}>
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="p-5 grid grid-cols-3 gap-4">
        {filtradas.length === 0 ? (
          <div className="col-span-2 py-12 text-center text-gray-400 text-sm italic">
            No hay integraciones en esta categoría
          </div>
        ) : filtradas.map(integ => (
          <IntegracionCard
            key={integ.id}
            integ={integ}
            onConectar={onConectar}
            onDesconectar={onDesconectar}
          />
        ))}
      </div>
    </div>
  )
}