import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Badge, Button, Card, Erro, Field, Modal, PageHeader, inputCls } from '../components/ui'
import { useControlador } from '../controlador'
import { tempoRelativo, useComando } from '../hooks'
import { duracao } from '../rotinas'
import type { Perfil, UsuarioAdmin } from '../types'

export default function Ajustes() {
  const { usuario, sair } = useAuth()
  const admin = usuario?.perfil === 'ADMIN'
  return (
    <div className="space-y-6">
      <PageHeader titulo="Ajustes" />
      <InfoControlador />
      {admin && <Parametros />}
      {admin && <Usuarios />}
      <Card className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{usuario?.nome}</p>
          <p className="text-sm text-muted">
            {usuario?.email} · {usuario?.perfil === 'ADMIN' ? 'Administrador' : 'Operador'}
          </p>
        </div>
        <Button variant="secondary" onClick={sair}>
          Sair
        </Button>
      </Card>
    </div>
  )
}

function InfoControlador() {
  const { controlador } = useControlador()
  const s = controlador.ultimoStatus
  return (
    <section>
      <h2 className="mb-2 font-serif text-lg">Controlador</h2>
      <Card className="space-y-1 text-sm">
        <p>
          <b>{controlador.nome}</b> · {controlador.online ? 'online' : 'offline'} · última notícia {tempoRelativo(controlador.vistoEm)}
        </p>
        <p className="text-muted">
          Prefixo MQTT: <code>{controlador.prefixo}</code>
        </p>
        {s && (
          <p className="text-muted">
            Relógio do controlador: {s.hora?.replace('T', ' ')} · ligado há {duracao(s.uptimeS ?? 0)} · sinal Wi‑Fi {s.wifiRssi} dBm
          </p>
        )}
        {!controlador.brokerConectado && <p className="text-rose-700">O servidor está sem conexão com o broker MQTT.</p>}
      </Card>
    </section>
  )
}

function Parametros() {
  const { controlador } = useControlador()
  const { executar, enviando } = useComando()
  const cfg = controlador.ultimaConfig
  const [pausa, setPausa] = useState(cfg?.pausaVisitaMin ?? 30)
  const [motor, setMotor] = useState(cfg?.soMotorMin ?? 15)
  if (!cfg) return null

  return (
    <section>
      <h2 className="mb-2 font-serif text-lg">Limites de segurança</h2>
      <Card>
        <form
          className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            executar(`param ${JSON.stringify({ pausaVisitaMin: pausa, soMotorMin: motor })}`, 'Limites salvos no controlador.')
          }}
        >
          <Field label="Pausa visita volta sozinha em (min)">
            <input className={inputCls} type="number" min={1} max={240} value={pausa} onChange={(e) => setPausa(Number(e.target.value))} />
          </Field>
          <Field label="Só motor desliga sozinho em (min)">
            <input className={inputCls} type="number" min={1} max={120} value={motor} onChange={(e) => setMotor(Number(e.target.value))} />
          </Field>
          <Button type="submit" disabled={enviando !== null || (pausa === cfg.pausaVisitaMin && motor === cfg.soMotorMin)}>
            Salvar
          </Button>
        </form>
      </Card>
    </section>
  )
}

function Usuarios() {
  const qc = useQueryClient()
  const { usuario: eu } = useAuth()
  const lista = useQuery({ queryKey: ['usuarios'], queryFn: () => api<UsuarioAdmin[]>('/usuarios') })
  const [novo, setNovo] = useState(false)
  const alterar = useMutation({
    mutationFn: ({ id, ...dados }: { id: string; ativo?: boolean; perfil?: Perfil }) => api(`/usuarios/${id}`, { method: 'PATCH', body: dados }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  })

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-serif text-lg">Usuários</h2>
        <Button small onClick={() => setNovo(true)}>
          + Novo usuário
        </Button>
      </div>
      <p className="mb-2 text-sm text-muted">
        <b>Operador</b>: pausa, só motor, acionamento manual e blocos com mudas/vazio. <b>Administrador</b>: também rotinas, setores,
        limites e usuários.
      </p>
      <Erro erro={lista.error ?? alterar.error} />
      <Card className="divide-y divide-line p-0">
        {(lista.data ?? []).map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className={u.ativo ? '' : 'opacity-50'}>
              <p className="font-semibold">
                {u.nome} {!u.ativo && <Badge className="bg-sand text-muted">Inativo</Badge>}
              </p>
              <p className="text-sm text-muted">{u.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border border-line bg-white px-2 py-1 text-sm"
                value={u.perfil}
                disabled={u.id === eu?.id}
                onChange={(e) => alterar.mutate({ id: u.id, perfil: e.target.value as Perfil })}
              >
                <option value="OPERADOR">Operador</option>
                <option value="ADMIN">Administrador</option>
              </select>
              {u.id !== eu?.id && (
                <Button small variant="secondary" onClick={() => alterar.mutate({ id: u.id, ativo: !u.ativo })}>
                  {u.ativo ? 'Desativar' : 'Reativar'}
                </Button>
              )}
            </div>
          </div>
        ))}
      </Card>
      <NovoUsuario aberto={novo} onFechar={() => setNovo(false)} />
    </section>
  )
}

function NovoUsuario({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ nome: '', email: '', senha: '', perfil: 'OPERADOR' as Perfil })
  const criar = useMutation({
    mutationFn: () => api('/usuarios', { method: 'POST', body: f }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      setF({ nome: '', email: '', senha: '', perfil: 'OPERADOR' })
      onFechar()
    },
  })
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    criar.mutate()
  }
  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Novo usuário">
      <form onSubmit={enviar} className="space-y-3">
        <Field label="Nome">
          <input className={inputCls} required minLength={2} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </Field>
        <Field label="E-mail">
          <input className={inputCls} type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Senha inicial" hint="Mínimo de 6 caracteres">
          <input className={inputCls} type="password" required minLength={6} value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} />
        </Field>
        <Field label="Perfil">
          <select className={inputCls} value={f.perfil} onChange={(e) => setF({ ...f, perfil: e.target.value as Perfil })}>
            <option value="OPERADOR">Operador</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </Field>
        <Erro erro={criar.error} />
        <Button type="submit" className="w-full" disabled={criar.isPending}>
          {criar.isPending ? 'Salvando…' : 'Criar usuário'}
        </Button>
      </form>
    </Modal>
  )
}
