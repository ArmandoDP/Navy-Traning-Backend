// Formato esperado del string guardado en DB:
// "L-V: 05:45-11:00, 17:00-21:30 | S: 07:50-11:00 | D: 10:00-11:00"
//
// Resultado: array de { dia, manana, tarde }

const DIAS_MAP: Record<string, string[]> = {
  L:    ['Lunes'],
  M:    ['Martes'],
  X:    ['Miércoles'],
  J:    ['Jueves'],
  V:    ['Viernes'],
  S:    ['Sábado'],
  D:    ['Domingo'],
  'L-J': ['Lunes', 'Martes', 'Miércoles', 'Jueves'],          // ← faltaba
  'L-V': ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
  'L-S': ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  'L-D': ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
  'M-V': ['Martes', 'Miércoles', 'Jueves', 'Viernes'],        // ← por si acaso
  'M-S': ['Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
}

function fmt(hora: string): string {
  // "05:45" → "5:45 a.m." | "17:00" → "5 p.m." | "11:00" → "11 a.m."
  const [hStr, mStr] = hora.trim().split(':')
  const h = parseInt(hStr)
  const m = parseInt(mStr)
  const pm = h >= 12
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
  const minStr = m > 0 ? `:${String(m).padStart(2, '0')}` : ''
  return `${h12}${minStr} ${pm ? 'p.m.' : 'a.m.'}`
}

function fmtRango(rango: string): string {
  // "05:45-11:00" → "5:45–11 a.m."
  const [ini, fin] = rango.split('-')
  return `${fmt(ini)}–${fmt(fin)}`
}

export interface HorarioDia {
  dia:    string
  manana: string
  tarde:  string
}

export function parseHorario(horario: string): HorarioDia[] {
  if (!horario) return []

  // Orden de días para mostrar
  const ORDEN = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const result: Record<string, { manana: string; tarde: string }> = {}

  // Separa por "|"
  const bloques = horario.split('|').map(b => b.trim())

  for (const bloque of bloques) {
    // "L-V: 05:45-11:00, 17:00-21:30"
    const [keyPart, horaPart] = bloque.split(':').slice(0, 1).concat(bloque.split(':').slice(1).join(':').trim()).map(s => s.trim())
    if (!keyPart || !horaPart) continue

    const dias = DIAS_MAP[keyPart] || [keyPart]
    const rangos = horaPart.split(',').map(r => r.trim())
    const manana = rangos[0] ? fmtRango(rangos[0]) : ''
    const tarde  = rangos[1] ? fmtRango(rangos[1]) : ''

    for (const dia of dias) {
      result[dia] = { manana, tarde }
    }
  }

  // Devuelve en orden canónico, solo días que tienen dato
  return ORDEN
    .filter(d => result[d])
    .map(d => ({ dia: d, manana: result[d].manana, tarde: result[d].tarde }))
}