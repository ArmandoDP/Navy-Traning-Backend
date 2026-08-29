'use client'

type Tab = 'activas' | 'cancelaciones' | 'no-shows'

interface Props {
  tab:         Tab
  cantidad:    number
  onResponder?:  () => void
  onDeshacer?:   () => void
  onNoAplicar?:  () => void
  onContinuar?:  () => void
  onPenalizar?:  () => void
  onPerdonar?:   () => void
}

export default function ReservasBulkActions({
  tab, cantidad,
  onResponder, onDeshacer, onNoAplicar, onContinuar, onPenalizar, onPerdonar
}: Props) {
  if (cantidad === 0) return null

  const ghost   = 'px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-100 bg-white transition'
  const primary = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition'

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-indigo-50">
      <span className="text-xs text-indigo-600 font-bold mr-2">{cantidad} seleccionados</span>

      {tab === 'activas' && (
        <>
          <button onClick={onResponder} className={primary}>Responder</button>
          <button onClick={onNoAplicar} className={ghost}>No aplicar</button>
          <button onClick={onContinuar} className={ghost}>Continuar reserva</button>
        </>
      )}

      {tab === 'cancelaciones' && (
        <>
          <button onClick={onResponder} className={primary}>Responder</button>
          <button onClick={onDeshacer}  className={ghost}>Deshacer cancelación</button>
          <button onClick={onNoAplicar} className={ghost}>No aplicar</button>
          <button onClick={onContinuar} className={ghost}>Continuar reserva</button>
        </>
      )}

      {tab === 'no-shows' && (
        <>
          <button onClick={onResponder} className={primary}>Responder</button>
          <button onClick={onPenalizar} className={ghost}>Penalizar</button>
          <button onClick={onPerdonar}  className={ghost}>Perdonar penalización</button>
        </>
      )}
    </div>
  )
}