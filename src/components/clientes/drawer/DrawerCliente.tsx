'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Mail, Phone, Snowflake, CreditCard } from 'lucide-react'
import DrawerClienteHeader from './DrawerClienteHeader'
import TabResumen          from './tabs/TabResumen'
import TabMembresia        from './tabs/TabMembresia'
import TabReservas         from './tabs/TabReservas'
import TabPagos            from './tabs/TabPagos'
import TabNotas            from './tabs/TabNotas'
import TabComunicaciones   from './tabs/TabComunicaciones'
import TabActividad        from './tabs/TabActividad'
import ToastExito          from '@/components/ToastExito'

type Tab = 'resumen' | 'membresia' | 'reservas' | 'pagos' | 'notas' | 'comunicaciones' | 'actividad'

interface Props {
  clienteId: string | null
  isOpen:    boolean
  onClose:   () => void
  onEditar:  (cliente: any) => void
}

export default function DrawerCliente({ clienteId, isOpen, onClose, onEditar }: Props) {
  const [tab,           setTab]           = useState<Tab>('resumen')
  const [cliente,       setCliente]       = useState<any>(null)
  const [reservas,      setReservas]      = useState<any[]>([])
  const [pagos,         setPagos]         = useState<any[]>([])
  const [notas,         setNotas]         = useState<any[]>([])
  const [comunicaciones,setComunicaciones]= useState<any[]>([])
  const [loading,       setLoading]       = useState(true)
  const [toast,         setToast]         = useState<string | null>(null)

  const fetchData = async () => {
    if (!clienteId) return
    setLoading(true)

    const [{ data: cli }, { data: res }, { data: pgs }, { data: nts }, { data: coms }] = await Promise.all([
      supabase.from('clientes').select('*, sucursales(nombre, color), paquetes(nombre, numero_clases, precio)')
        .eq('id', clienteId).single(),
      supabase.from('reservas').select('*, clases(nombre_clase, horario, tipo_clase, staff(nombre, primer_apellido), sucursales(nombre))')
        .eq('cliente_id', clienteId).order('created_at', { ascending: false }),
      supabase.from('pagos').select('*, sucursales(nombre)')
        .eq('cliente_id', clienteId).order('fecha_pago', { ascending: false }),
      supabase.from('notas_cliente').select('*')
        .eq('cliente_id', clienteId).order('created_at', { ascending: false }),
      supabase.from('comunicaciones').select('*')
        .eq('cliente_id', clienteId).order('created_at', { ascending: false }),
    ])

    if (cli)  setCliente(cli)
    setReservas(res  || [])
    setPagos(pgs     || [])
    setNotas(nts     || [])
    setComunicaciones(coms || [])
    setLoading(false)
  }

  useEffect(() => {
    if (isOpen && clienteId) { fetchData(); setTab('resumen') }
  }, [isOpen, clienteId])

  const noShows = reservas.filter(r => r.lista_espera).length

  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen',        label: 'Resumen'                              },
    { key: 'membresia',      label: 'Membresía'                            },
    { key: 'reservas',       label: `Reservas (${reservas.length})`        },
    { key: 'pagos',          label: 'Pagos'                                },
    { key: 'notas',          label: `Notas (${notas.length})`              },
    { key: 'comunicaciones', label: 'Comunicaciones'                       },
    { key: 'actividad',      label: 'Actividad'                            },
  ]

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer */}
      <div className={`fixed top-0 right-0 z-50 h-full w-full max-w-3xl bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Cargando...
          </div>
        ) : !cliente ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Cliente no encontrado
          </div>
        ) : (
          <>
            {/* Close */}
            <button onClick={onClose}
              className="absolute top-4 right-4 z-10 p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-400">
              <X size={18}/>
            </button>

            {/* Header */}
            <DrawerClienteHeader
              cliente={cliente}
              onEditar={() => onEditar(cliente)}
              noShows={noShows}
            />

            {/* Tabs */}
            <div className="flex overflow-x-auto border-b border-gray-100 px-6 gap-0 flex-shrink-0">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-3 text-sm font-semibold whitespace-nowrap transition border-b-2 ${
                    tab === t.key
                      ? 'border-gray-900 text-black font-bold'
                      : 'border-transparent text-gray-700 hover:text-gray-400'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Contenido */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {tab === 'resumen'        && <TabResumen        cliente={cliente} reservas={reservas} onRefresh={fetchData} onEditar={onEditar} noShows={noShows} />}
              {tab === 'membresia'      && <TabMembresia      cliente={cliente} reservas={reservas} />}
              {tab === 'reservas'       && <TabReservas       reservas={reservas} />}
              {tab === 'pagos'          && <TabPagos          pagos={pagos} />}
              {tab === 'notas'          && <TabNotas          clienteId={clienteId!} notas={notas} onRefresh={fetchData} />}
              {tab === 'comunicaciones' && <TabComunicaciones cliente={cliente} comunicaciones={comunicaciones} />}
              {tab === 'actividad'      && <TabActividad      reservas={reservas} pagos={pagos} comunicaciones={comunicaciones} />}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 px-6 py-4 border-t border-gray-100 bg-white">
              <button onClick={() => setToast('Email disponible con la integración de Twilio/SendGrid.')}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition">
                <Mail size={13}/> Email
              </button>
              <button onClick={() => setToast('SMS disponible con la integración de Twilio.')}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition">
                <Phone size={13}/> SMS
              </button>
              <button onClick={() => setToast('Congelar membresía estará disponible próximamente.')}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition">
                <Snowflake size={13}/> Congelar
              </button>
              <button onClick={() => setToast('Aplicar crédito estará disponible con la integración de Stripe.')}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition">
                <CreditCard size={13}/> Aplicar crédito
              </button>
            </div>
          </>
        )}
      </div>

      {toast && (
        <ToastExito
          titulo="Próximamente"
          mensaje={toast}
          onClose={() => setToast(null)}
          duracion={3000}
        />
      )}
    </>
  )
}