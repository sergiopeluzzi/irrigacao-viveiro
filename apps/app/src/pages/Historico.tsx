import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { Button, Card, Carregando, Erro, PageHeader, Vazio } from '../components/ui'
import { useControlador } from '../controlador'
import { limparSaida } from '../hooks'
import type { ComandoLog, Evento } from '../types'

const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })

export default function Historico() {
  const [aba, setAba] = useState<'eventos' | 'comandos'>('eventos')
  return (
    <div>
      <PageHeader titulo="Histórico">
        <div className="flex rounded-full border border-line bg-white p-0.5 text-sm">
          {(['eventos', 'comandos'] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAba(a)}
              className={`rounded-full px-3 py-1 font-medium ${aba === a ? 'bg-brand text-white' : 'text-muted'}`}
            >
              {a === 'eventos' ? 'Acontecimentos' : 'Quem fez o quê'}
            </button>
          ))}
        </div>
      </PageHeader>
      {aba === 'eventos' ? <Eventos /> : <Comandos />}
    </div>
  )
}

function Eventos() {
  const { controlador } = useControlador()
  const q = useInfiniteQuery({
    queryKey: ['eventos', controlador.id],
    queryFn: ({ pageParam }) =>
      api<Evento[]>(`/controladores/${controlador.id}/eventos?limite=100${pageParam ? `&antes=${pageParam}` : ''}`),
    initialPageParam: 0,
    getNextPageParam: (ultima) => (ultima.length === 100 ? ultima[ultima.length - 1].id : undefined),
  })
  if (q.isLoading) return <Carregando />
  if (q.error) return <Erro erro={q.error} />
  const eventos = q.data?.pages.flat() ?? []
  if (!eventos.length) return <Vazio>Nenhum acontecimento registrado ainda.</Vazio>

  const grupos: { dia: string; itens: Evento[] }[] = []
  for (const e of eventos) {
    const d = dia(e.recebidoEm)
    if (grupos.at(-1)?.dia !== d) grupos.push({ dia: d, itens: [] })
    grupos.at(-1)!.itens.push(e)
  }

  return (
    <div className="space-y-4">
      {grupos.map((g) => (
        <section key={g.dia}>
          <h2 className="mb-1.5 text-sm font-semibold text-muted capitalize">{g.dia}</h2>
          <Card className="divide-y divide-line p-0">
            {g.itens.map((e) => (
              <p key={e.id} className="px-4 py-2 text-sm">
                <span className="mr-2 font-mono text-xs text-muted">{e.horaDispositivo}</span>
                {e.mensagem}
              </p>
            ))}
          </Card>
        </section>
      ))}
      {q.hasNextPage && (
        <Button variant="secondary" className="w-full" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          {q.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
        </Button>
      )}
    </div>
  )
}

function Comandos() {
  const { controlador } = useControlador()
  const q = useInfiniteQuery({
    queryKey: ['comandos', controlador.id],
    queryFn: ({ pageParam }) => api<ComandoLog[]>(`/controladores/${controlador.id}/comandos${pageParam ? `?antes=${pageParam}` : ''}`),
    initialPageParam: 0,
    getNextPageParam: (ultima) => (ultima.length === 50 ? ultima[ultima.length - 1].id : undefined),
  })
  if (q.isLoading) return <Carregando />
  if (q.error) return <Erro erro={q.error} />
  const lista = q.data?.pages.flat() ?? []
  if (!lista.length) return <Vazio>Nenhum comando enviado pelo app ainda.</Vazio>

  return (
    <div className="space-y-2">
      {lista.map((c) => (
        <Card key={c.id} className="py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <p>
              <b>{c.usuario.nome}</b> enviou <code className="rounded bg-sand px-1.5 py-0.5 text-xs break-all">{c.texto}</code>
            </p>
            <p className="text-xs text-muted">{new Date(c.enviadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })}</p>
          </div>
          <p className={`mt-1 text-xs whitespace-pre-line ${c.resposta === null ? 'text-rose-700' : 'text-muted'}`}>
            {c.resposta === null ? 'Sem resposta do controlador.' : limparSaida(c.resposta).split('\n').slice(0, 3).join('\n')}
          </p>
        </Card>
      ))}
      {q.hasNextPage && (
        <Button variant="secondary" className="w-full" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          Carregar mais
        </Button>
      )}
    </div>
  )
}
