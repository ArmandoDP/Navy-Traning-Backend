'use client'

interface Props {
  activo:   boolean
  tipo:     string
  fechaFin: string
  onTipo:   (v: string) => void
  onFin:    (v: string) => void
}

const TIPOS = [
  { key: 'diario',     label: 'Diario' },
  { key: 'semanal',    label: 'Semanal' },
  { key: 'quincenal',  label: 'Quincenal' },
  { key: 'mensual',    label: 'Mensual' },
]

export default function RecurrenciaConfig({ activo, tipo, fechaFin, onTipo, onFin }: Props) {
  if (!activo) return null

  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-4 space-y-3">
      <p className="text-xs font-black text-indigo-600 uppercase tracking-wide">Configurar recurrencia</p>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-600">Frecuencia</label>
        <div className="flex gap-2 flex-wrap">
          {TIPOS.map(t => (
            <button key={t.key} type="button"
              onClick={() => onTipo(t.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                tipo === t.key
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-600">Repetir hasta</label>
        <input type="date"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-indigo-400 bg-white"
          value={fechaFin}
          onChange={e => onFin(e.target.value)} />
      </div>

      {tipo && fechaFin && (
        <p className="text-[11px] text-indigo-500 font-medium">
          ✓ Se crearán clases {tipo === 'diario' ? 'cada día' : tipo === 'semanal' ? 'cada semana' : tipo === 'quincenal' ? 'cada 2 semanas' : 'cada mes'} hasta el {new Date(fechaFin).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      )}
    </div>
  )
}