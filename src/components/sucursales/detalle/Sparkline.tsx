interface Props {
  data:  number[]
  color: string
}

export default function Sparkline({ data, color }: Props) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const rng = max - min || 1
  const W = 96, H = 32
  const pts = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * W
    const y = H - ((v - min) / rng) * H
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-24 h-8" fill="none">
      <polyline points={pts} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}