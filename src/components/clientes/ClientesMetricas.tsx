interface Props {
  activos:       number
  expirados:     number
  pagosFallidos: number
  perdidos:      number
}

interface CardProps {
  label: string
  valor: number
  color: string
  bg:    string
}

function Card({ label, valor, color, bg }: CardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
      <p className={`text-3xl font-black`} style={{ color }}>{valor}</p>
    </div>
  )
}

export default function ClientesMetricas({ activos, expirados, pagosFallidos, perdidos }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card label="Activos"        valor={activos}       color="#16a34a" bg="#dcfce7" />
      <Card label="Expirados"      valor={expirados}     color="#dc2626" bg="#fee2e2" />
      <Card label="Pagos fallidos" valor={pagosFallidos} color="#d97706" bg="#fef3c7" />
      <Card label="Perdidos"       valor={perdidos}      color="#374151" bg="#f3f4f6" />
    </div>
  )
}