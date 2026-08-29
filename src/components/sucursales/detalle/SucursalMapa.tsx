'use client'

interface Props {
  direccion: string
}

export default function SucursalMapa({ direccion }: Props) {
  if (!direccion) {
    return (
      <div className="bg-gray-100 border border-gray-200 rounded-2xl overflow-hidden h-64 flex items-center justify-center text-gray-400 text-sm">
        Sin dirección registrada
      </div>
    )
  }

  const query = encodeURIComponent(direccion)

  return (
    <div className="rounded-2xl overflow-hidden h-64 border border-gray-200">
      <iframe
        title="Mapa sucursal"
        width="100%"
        height="100%"
        style={{ border: 0 }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        src={`https://maps.google.com/maps?q=${query}&output=embed&z=15`}
      />
    </div>
  )
}