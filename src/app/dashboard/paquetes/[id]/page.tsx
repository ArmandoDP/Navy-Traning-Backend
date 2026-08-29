'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users, Clock, Tag, Package, ShieldCheck, XCircle, Star } from 'lucide-react'
import ModalCrearPaquete from '@/components/paquetes/ModalCrearPaquete'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Paquete {
  id: string
  nombre: string
  precio: number
  duracion: number
  numero_clases: number | null
  descripcion: string
  reglas_pagos: string
  cancelaciones: number
  no_shows: number
  add_ons: string
  estatus: string
  created_at: string
}

interface Cliente {
  id: string
  nombre_completo: string
  email: string
  estatus: string
  created_at: string
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function DetallePaquete() {
  const { id } = useParams()

  const [paquete,   setPaquete]   = useState<Paquete | null>(null)
  const [clientes,  setClientes]  = useState<Cliente[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true)

    const { data: paq } = await supabase
      .from('paquetes')
      .select('*')
      .eq('id', id)
      .single()

    const { data: clis } = await supabase
      .from('clientes')
      .select('id, nombre_completo, email, estatus, created_at')
      .eq('paquete_id', id)
      .order('created_at', { ascending: false })

    if (paq)  setPaquete(paq)
    if (clis) setClientes(clis)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  // ── Métricas ───────────────────────────────────────────────────────────────
  const totalClientes  = clientes.length
  const activos        = clientes.filter(c => c.estatus === 'Activo').length
  const ingresoTotal   = paquete ? paquete.precio * totalClientes : 0
  const retencion      = totalClientes > 0 ? Math.round((activos / totalClientes) * 100) : 0

  const inicioMes      = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const nuevosEsteMes  = clientes.filter(c => c.created_at >= inicioMes).length

  if (loading) return <div className="p-10 text-zinc-500 italic">Cargando paquete...</div>
  if (!paquete) return <div className="p-10 text-red-500">Paquete no encontrado.</div>

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* Back */}
      <Link href="/dashboard/paquetes" className="flex items-center gap-2 text-zinc-500 hover:text-white text-sm transition w-fit">
        <ArrowLeft size={16} /> Volver a Paquetes
      </Link>

      {/* Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Package size={22} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-black italic uppercase tracking-tighter">{paquete.nombre}</h1>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  paquete.estatus === 'Activo' ? 'bg-green-500/10 text-green-500' : 'bg-zinc-700 text-zinc-400'
                }`}>
                  {paquete.estatus}
                </span>
              </div>
              {paquete.descripcion && (
                <p className="text-zinc-500 text-sm mt-1 max-w-xl">{paquete.descripcion}</p>
              )}
              <p className="text-3xl font-black mt-3 text-white">${paquete.precio.toLocaleString()}
                <span className="text-zinc-500 text-base font-normal ml-2">MXN</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-bold transition w-fit"
          >
            Editar Paquete
          </button>
        </div>

        {/* Specs del paquete */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <Clock size={14} className="text-zinc-600" />
            <div>
              <p className="text-[10px] text-zinc-600 uppercase font-bold">Vigencia</p>
              <p className="font-bold text-white">{paquete.duracion} días</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <Tag size={14} className="text-zinc-600" />
            <div>
              <p className="text-[10px] text-zinc-600 uppercase font-bold">Clases</p>
              <p className="font-bold text-white">{paquete.numero_clases ?? 'Ilimitadas'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <XCircle size={14} className="text-zinc-600" />
            <div>
              <p className="text-[10px] text-zinc-600 uppercase font-bold">Cancelaciones</p>
              <p className="font-bold text-white">{paquete.cancelaciones} permitidas</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <ShieldCheck size={14} className="text-zinc-600" />
            <div>
              <p className="text-[10px] text-zinc-600 uppercase font-bold">No-shows</p>
              <p className="font-bold text-white">{paquete.no_shows} permitidos</p>
            </div>
          </div>
        </div>

        {/* Reglas + Add-ons */}
        {(paquete.reglas_pagos || paquete.add_ons) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-zinc-800">
            {paquete.reglas_pagos && (
              <div>
                <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Reglas / Políticas</p>
                <p className="text-zinc-400 text-sm">{paquete.reglas_pagos}</p>
              </div>
            )}
            {paquete.add_ons && (
              <div>
                <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1 flex items-center gap-1">
                  <Star size={10} /> Add-ons / Beneficios
                </p>
                <p className="text-zinc-400 text-sm">{paquete.add_ons}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Total Clientes</p>
          <p className="text-3xl font-black mt-1">{totalClientes}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Activos</p>
          <p className="text-3xl font-black mt-1 text-green-500">{activos}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Ingreso Total</p>
          <p className="text-3xl font-black mt-1">${ingresoTotal.toLocaleString()}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Retención</p>
          <p className="text-3xl font-black mt-1">{retencion}%</p>
          <div className="w-full bg-zinc-800 h-1.5 mt-2 rounded-full overflow-hidden">
            <div className="bg-white h-full transition-all" style={{ width: `${retencion}%` }} />
          </div>
        </div>
      </div>

      {/* Lista de clientes */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="font-black uppercase tracking-tighter">Clientes con este Paquete</h2>
          <div className="flex items-center gap-3">
            {nuevosEsteMes > 0 && (
              <span className="text-xs text-green-500 font-bold">+{nuevosEsteMes} este mes</span>
            )}
            <span className="text-zinc-500 text-xs">{totalClientes} en total</span>
          </div>
        </div>

        <table className="w-full text-left">
          <thead className="bg-zinc-800 text-zinc-400 text-xs uppercase font-bold">
            <tr>
              <th className="p-4">Nombre</th>
              <th className="p-4">Email</th>
              <th className="p-4">Estatus</th>
              <th className="p-4">Alta</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {clientes.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-zinc-600 italic">
                  Ningún cliente tiene este paquete aún
                </td>
              </tr>
            ) : clientes.map(c => (
              <tr key={c.id} className="hover:bg-zinc-800/50 transition">
                <td className="p-4 font-medium">{c.nombre_completo}</td>
                <td className="p-4 text-zinc-500 text-sm">{c.email}</td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    c.estatus === 'Activo' ? 'bg-green-500/10 text-green-500' : 'bg-zinc-700 text-zinc-400'
                  }`}>
                    {c.estatus}
                  </span>
                </td>
                <td className="p-4 text-zinc-500 text-sm">
                  {new Date(c.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="p-4">
                  <Link href={`/dashboard/clientes/${c.id}`} className="text-zinc-500 hover:text-white text-xs font-bold transition">
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal editar */}
      <ModalCrearPaquete
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { setModalOpen(false); fetchData() }}
        paquete={paquete}
      />
    </div>
  )
}