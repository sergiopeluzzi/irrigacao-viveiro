import { useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { API_BASE, api, getToken } from './api'
import type { Controlador, Evento, RespostaComando } from './types'

type Ctx = {
  controlador: Controlador
  lista: Controlador[]
  selecionar: (id: string) => void
  /** Momento (Date.now) em que o último status chegou: base para as contagens regressivas. */
  statusRecebidoEm: number
  tempoRealConectado: boolean
  enviar: (texto: string) => Promise<RespostaComando>
}

const Contexto = createContext<Ctx | null>(null)
const CHAVE = 'viveiro.controlador'

const lerSel = () => {
  try {
    return localStorage.getItem(CHAVE)
  } catch {
    return null
  }
}

export function ControladorProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const lista = useQuery({ queryKey: ['controladores'], queryFn: () => api<Controlador[]>('/controladores') })
  const [selId, setSelId] = useState<string | null>(lerSel)
  const [statusRecebidoEm, setStatusRecebidoEm] = useState(() => Date.now())
  const [tempoRealConectado, setTempoRealConectado] = useState(false)

  const controlador = lista.data?.find((c) => c.id === selId) ?? lista.data?.[0]
  const id = controlador?.id

  const selecionar = useCallback((novo: string) => {
    setSelId(novo)
    try {
      localStorage.setItem(CHAVE, novo)
    } catch {
      /* sem armazenamento */
    }
  }, [])

  // Tempo real: a API repassa o que chega do MQTT (status, config, conexão e eventos).
  useEffect(() => {
    if (!id) return
    const atualizar = (patch: Partial<Controlador>) =>
      qc.setQueryData<Controlador[]>(['controladores'], (old) => old?.map((c) => (c.id === id ? { ...c, ...patch } : c)))

    const es = new EventSource(`${API_BASE}/controladores/${id}/tempo-real?token=${encodeURIComponent(getToken() ?? '')}`)
    es.onopen = () => {
      setTempoRealConectado(true)
      qc.invalidateQueries({ queryKey: ['controladores'] }) // ressincroniza o que pode ter mudado enquanto estava fora
    }
    es.onerror = () => setTempoRealConectado(false) // o EventSource reconecta sozinho
    es.addEventListener('status', (e) => {
      atualizar({ ultimoStatus: JSON.parse(e.data), vistoEm: new Date().toISOString() })
      setStatusRecebidoEm(Date.now())
    })
    es.addEventListener('config', (e) => atualizar({ ultimaConfig: JSON.parse(e.data) }))
    es.addEventListener('conexao', (e) => atualizar({ online: JSON.parse(e.data).online }))
    es.addEventListener('evento', (e) => {
      const ev: Evento = JSON.parse(e.data)
      qc.setQueryData<InfiniteData<Evento[]>>(['eventos', id], (old) =>
        old ? { ...old, pages: [[ev, ...(old.pages[0] ?? [])], ...old.pages.slice(1)] } : old,
      )
      qc.setQueryData<Evento[]>(['eventos-recentes', id], (old) => (old ? [ev, ...old].slice(0, 8) : old))
    })
    return () => es.close()
  }, [id, qc])

  const enviar = useCallback(
    async (texto: string) => {
      if (!id) throw new Error('Nenhum controlador cadastrado.')
      return api<RespostaComando>(`/controladores/${id}/comandos`, { method: 'POST', body: { texto } })
    },
    [id],
  )

  if (lista.isLoading) return <p className="py-10 text-center text-sm text-muted">Carregando…</p>
  if (lista.error) return <p className="p-6 text-center text-sm text-rose-700">Não foi possível falar com o servidor.</p>
  if (!controlador) {
    return <p className="p-6 text-center text-sm text-muted">Nenhum controlador cadastrado. Rode o seed da API.</p>
  }

  return (
    <Contexto.Provider
      value={{ controlador, lista: lista.data ?? [], selecionar, statusRecebidoEm, tempoRealConectado, enviar }}
    >
      {children}
    </Contexto.Provider>
  )
}

export function useControlador() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useControlador fora do ControladorProvider')
  return ctx
}

/** Segundos restantes do modo (pausa visita / só motor), contando no navegador entre um status e outro. */
export function useContagem(segundosNoStatus: number | undefined, recebidoEm: number) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    if (segundosNoStatus === undefined) return
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [segundosNoStatus])
  if (segundosNoStatus === undefined) return undefined
  return Math.max(0, segundosNoStatus - Math.floor((agora - recebidoEm) / 1000))
}
