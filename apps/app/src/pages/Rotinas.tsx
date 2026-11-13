import { useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../auth'
import { Badge, Button, Card, Erro, Field, Modal, PageHeader, Vazio, inputCls } from '../components/ui'
import { useControlador } from '../controlador'
import { limparSaida, useComando } from '../hooks'
import { DIAS, TIPOS, duracao, previa, textoDias } from '../rotinas'
import type { Dia, Rotina, SetorCfg, TipoRotina } from '../types'

type Rascunho = Omit<Rotina, 'id'> & { id?: number }

const NOVA: Rascunho = {
  nome: '',
  tipo: 'irrigacao',
  dias: 'todos',
  inicio: '07:00',
  fim: '08:00',
  ligado: 30,
  pausa: 240,
  mistura: 0,
  setores: [1, 2, 3, 4],
  ativa: true,
}

export default function Rotinas() {
  const { usuario } = useAuth()
  const { controlador } = useControlador()
  const { executar, enviando } = useComando()
  const [editando, setEditando] = useState<Rascunho | null>(null)
  const admin = usuario?.perfil === 'ADMIN'
  const config = controlador.ultimaConfig

  if (!config) return <Vazio>Ainda não recebemos a configuração do controlador.</Vazio>
  const nomeSetor = (n: number) => config.setores[n - 1]?.nome ?? `Setor ${n}`

  return (
    <div>
      <PageHeader titulo="Rotinas">
        {admin && <Button onClick={() => setEditando({ ...NOVA })}>+ Nova rotina</Button>}
      </PageHeader>
      {config.rotinas.length === 0 && <Vazio>Nenhuma rotina cadastrada.</Vazio>}
      <div className="space-y-3">
        {config.rotinas.map((r) => {
          const p = previa(r, config.setores)
          return (
            <Card key={r.id} className={r.ativa ? '' : 'opacity-60'}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {r.nome} <Badge className={TIPOS[r.tipo].cor}>{TIPOS[r.tipo].rotulo}</Badge>
                    {!r.ativa && <Badge className="ml-1 bg-sand text-muted">Desativada</Badge>}
                  </p>
                  <p className="text-sm text-muted">
                    {r.inicio}–{r.fim} · {textoDias(r.dias)}
                  </p>
                  <p className="text-sm">
                    {duracao(r.ligado)} por setor
                    {r.pausa ? ` · pausa de ${duracao(r.pausa)}` : ' · uma vez só'}
                    {r.tipo === 'adubacao' && r.mistura ? ` · mistura ${duracao(r.mistura)}` : ''}
                  </p>
                  <p className="text-sm text-muted">{r.setores.map(nomeSetor).join(', ')}</p>
                  <p className="mt-1 text-xs text-muted">
                    {p.ciclos ? `≈ ${p.ciclos} ciclo(s) por dia, ~${duracao(p.duracaoCiclo)} cada` : 'Nenhum setor com mudas: a bomba não vai ligar.'}
                  </p>
                </div>
                {admin && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      small
                      variant="secondary"
                      disabled={enviando !== null}
                      onClick={() => executar(`${r.ativa ? 'desativar' : 'ativar'} ${r.id}`, `Rotina ${r.ativa ? 'desativada' : 'ativada'}.`)}
                    >
                      {r.ativa ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button small variant="secondary" onClick={() => setEditando({ ...r })}>
                      Editar
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>
      {editando && <FormRotina rascunho={editando} setores={config.setores} onFechar={() => setEditando(null)} />}
    </div>
  )
}

function FormRotina({ rascunho, setores, onFechar }: { rascunho: Rascunho; setores: SetorCfg[]; onFechar: () => void }) {
  const { enviar } = useControlador()
  const { executar } = useComando()
  const [r, setR] = useState<Rascunho>(rascunho)
  const [pausaMin, setPausaMin] = useState(rascunho.pausa / 60)
  const [erro, setErro] = useState<unknown>(null)
  const [salvando, setSalvando] = useState(false)
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((x) => ({ ...x, [k]: v }))

  const dias: Dia[] = r.dias === 'todos' ? DIAS.map((d) => d.id) : r.dias
  const alternarDia = (d: Dia) => {
    const novo = dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d]
    set('dias', novo.length === 7 ? 'todos' : DIAS.map((x) => x.id).filter((x) => novo.includes(x)))
  }
  const alternarSetor = (n: number) =>
    set('setores', r.setores.includes(n) ? r.setores.filter((x) => x !== n) : [...r.setores, n].sort((a, b) => a - b))

  const final = { ...r, pausa: Math.round(pausaMin * 60) }
  const p = previa(final, setores)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!final.setores.length) return setErro(new Error('Escolha pelo menos um setor.'))
    if (final.dias !== 'todos' && !final.dias.length) return setErro(new Error('Escolha pelo menos um dia.'))
    const corpo: Record<string, unknown> = {
      ...(final.id ? { id: final.id } : {}),
      nome: final.nome.trim(),
      tipo: final.tipo,
      dias: final.dias,
      inicio: final.inicio,
      fim: final.fim,
      ligado: final.ligado,
      pausa: final.pausa,
      setores: final.setores,
      ativa: final.ativa,
      ...(final.tipo === 'adubacao' ? { mistura: final.mistura ?? 0 } : {}),
    }
    setSalvando(true)
    try {
      const resp = await enviar(`rotina ${JSON.stringify(corpo)}`)
      if (resp.erro) setErro(new Error(limparSaida(resp.saida)))
      else onFechar()
    } catch (err) {
      setErro(err)
    } finally {
      setSalvando(false)
    }
  }

  async function apagar() {
    if (!r.id || !confirm(`Apagar a rotina "${r.nome}"? Não dá para desfazer.`)) return
    if (await executar(`apagar ${r.id}`, 'Rotina apagada.')) onFechar()
  }

  return (
    <Modal aberto onFechar={onFechar} titulo={r.id ? `Editar ${rascunho.nome}` : 'Nova rotina'} largo>
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome">
            <input className={inputCls} required maxLength={23} value={r.nome} onChange={(e) => set('nome', e.target.value)} />
          </Field>
          <Field label="Tipo">
            <select className={inputCls} value={r.tipo} onChange={(e) => set('tipo', e.target.value as TipoRotina)}>
              {Object.entries(TIPOS).map(([id, t]) => (
                <option key={id} value={id}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-muted">Dias</span>
          <div className="flex flex-wrap gap-1.5">
            {DIAS.map((d) => (
              <Chip key={d.id} ativo={dias.includes(d.id)} onClick={() => alternarDia(d.id)}>
                {d.curto}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Começa às">
            <input className={inputCls} type="time" required value={r.inicio} onChange={(e) => set('inicio', e.target.value)} />
          </Field>
          <Field label="Até" hint={r.fim < r.inicio ? 'Passa da meia-noite' : undefined}>
            <input className={inputCls} type="time" required value={r.fim} onChange={(e) => set('fim', e.target.value)} />
          </Field>
          <Field label="Ligado (s)" hint="por setor">
            <input className={inputCls} type="number" min={1} max={3600} required value={r.ligado} onChange={(e) => set('ligado', Number(e.target.value))} />
          </Field>
          <Field label="Pausa (min)" hint="0 = roda uma vez">
            <input className={inputCls} type="number" min={0} max={1440} step="0.5" required value={pausaMin} onChange={(e) => setPausaMin(Number(e.target.value))} />
          </Field>
        </div>

        {r.tipo === 'adubacao' && (
          <Field label="Misturar o adubo antes (min)" hint="Só o motor, com a água voltando pelo retorno, antes do 1º ciclo">
            <input
              className={inputCls}
              type="number"
              min={0}
              max={60}
              step="0.5"
              value={(r.mistura ?? 0) / 60}
              onChange={(e) => set('mistura', Math.round(Number(e.target.value) * 60))}
            />
          </Field>
        )}

        <div>
          <span className="mb-1 block text-sm font-medium text-muted">Setores (um de cada vez, na ordem)</span>
          <div className="flex flex-wrap gap-1.5">
            {setores.map((s) => (
              <Chip key={s.n} ativo={r.setores.includes(s.n)} onClick={() => alternarSetor(s.n)} apagado={!s.instalado || !s.mudas}>
                {s.nome}
                {!s.instalado ? ' (não instalado)' : !s.mudas ? ' (vazio)' : ''}
              </Chip>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={r.ativa} onChange={(e) => set('ativa', e.target.checked)} /> Rotina ativa
        </label>

        <div className="rounded-xl bg-sand px-3 py-2 text-sm">
          {p.ciclos ? (
            <>
              <b>
                ≈ {p.ciclos} ciclo(s) por dia, ~{duracao(p.duracaoCiclo)} cada
              </b>{' '}
              ({p.ativos} setor(es) com mudas)
              <br />
              <span className="text-muted">
                {p.horarios.join(' · ')}
                {p.ciclos > p.horarios.length ? ' …' : ''}
              </span>
            </>
          ) : (
            'Nenhum setor escolhido está instalado e com mudas: a bomba não vai ligar.'
          )}
        </div>

        <Erro erro={erro} />
        <div className="flex flex-wrap justify-between gap-2">
          {r.id ? (
            <Button variant="ghost" className="text-rose-700" onClick={apagar}>
              Apagar rotina
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? 'Enviando…' : 'Salvar no controlador'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function Chip({ ativo, apagado, onClick, children }: { ativo: boolean; apagado?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`rounded-full border px-3 py-1 text-sm font-medium ${ativo ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink'} ${apagado ? 'opacity-60' : ''}`}
    >
      {children}
    </button>
  )
}
