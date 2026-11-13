import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { StatusConexao } from '../components/Layout'
import { Badge, Button, Card, Field, Modal, inputCls } from '../components/ui'
import { useContagem, useControlador } from '../controlador'
import { mmss, tempoRelativo, useComando } from '../hooks'
import { hora, proximaRotina } from '../rotinas'
import type { Evento, SetorCfg, Status } from '../types'

const DESCRICAO_CICLO: Record<string, string> = {
  ocioso: 'Aguardando a próxima rotina',
  'misturando adubo': 'Misturando o adubo (só motor)',
  'abrindo valvula': 'Abrindo a válvula',
  irrigando: 'Irrigando',
  'trocando setor': 'Trocando de setor',
  desligando: 'Desligando',
}

export default function Painel() {
  const { controlador, statusRecebidoEm } = useControlador()
  const { executar, enviando } = useComando()
  const [manual, setManual] = useState<SetorCfg | null>(null)
  const status = controlador.ultimoStatus
  const config = controlador.ultimaConfig
  const restante = useContagem(status?.modoRestanteS, statusRecebidoEm)

  const recentes = useQuery({
    queryKey: ['eventos-recentes', controlador.id],
    queryFn: () => api<Evento[]>(`/controladores/${controlador.id}/eventos?limite=8`),
  })

  if (!status || !config) {
    return (
      <Card>
        <p className="font-semibold">Ainda não recebemos dados do controlador.</p>
        <p className="mt-1 text-sm text-muted">
          Confira se ele está ligado e com internet. Prefixo MQTT: <code>{controlador.prefixo}</code>
        </p>
        <div className="mt-3">
          <StatusConexao />
        </div>
      </Card>
    )
  }

  const emPausa = status.modo === 'PAUSA VISITA'
  const soMotor = status.modo === 'SO MOTOR'
  const offline = !controlador.online
  const prox = proximaRotina(config.rotinas)
  const setoresAbertos = status.setores.filter((s) => s.aberto).map((s) => config.setores[s.n - 1]?.nome ?? `Setor ${s.n}`)

  return (
    <div className="space-y-4">
      {offline && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
          ⚠️ O controlador está <b>offline</b> (última notícia {tempoRelativo(controlador.vistoEm)}). As rotinas continuam rodando
          nele, mas os comandos daqui não chegam até ele voltar.
        </p>
      )}

      <Card className={status.bomba ? 'border-agua/40 bg-sky-50' : ''}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Agora</p>
            <p className="text-xl font-semibold">
              {emPausa ? '⏸️ Irrigação pausada' : soMotor ? '⚙️ Só motor (misturando adubo)' : DESCRICAO_CICLO[status.ciclo] ?? status.ciclo}
            </p>
            {status.ciclo !== 'ocioso' && status.rotina && (
              <p className="text-sm text-muted">
                {status.rotina === 'manual' ? 'Acionamento manual' : `Rotina ${status.rotina}`}
                {setoresAbertos.length > 0 && ` · ${setoresAbertos.join(', ')}`}
              </p>
            )}
            {restante !== undefined && (emPausa || soMotor) && (
              <p className="mt-1 text-sm font-medium text-brand">Volta ao automático em {mmss(restante)}</p>
            )}
            {status.ciclo === 'ocioso' && !emPausa && !soMotor && prox && (
              <p className="text-sm text-muted">
                {prox.emAndamento
                  ? `Rotina ${prox.rotina.nome} em andamento até ${hora(prox.fim)}`
                  : `Próxima: ${prox.rotina.nome} às ${hora(prox.inicio)}${prox.inicio.toDateString() !== new Date().toDateString() ? ` (${prox.inicio.toLocaleDateString('pt-BR', { weekday: 'short' })})` : ''}`}
              </p>
            )}
          </div>
          <div className="text-right">
            <Badge className={status.bomba ? 'pulsar bg-agua text-white' : 'bg-sand text-muted'}>
              Bomba {status.bomba ? 'ligada' : 'desligada'}
            </Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <BotaoGrande
          ativo={emPausa}
          icone={emPausa ? '▶️' : '⏸️'}
          titulo={emPausa ? 'Retomar irrigação' : 'Pausar irrigação'}
          subtitulo={emPausa ? 'Volta ao automático agora' : `Para não molhar as visitas (volta sozinho em ${config.pausaVisitaMin} min)`}
          desabilitado={offline || enviando !== null}
          onClick={() => executar('pausa', emPausa ? 'Irrigação retomada.' : 'Irrigação pausada.')}
        />
        <BotaoGrande
          ativo={soMotor}
          icone="⚙️"
          titulo={soMotor ? 'Desligar motor' : 'Só motor'}
          subtitulo={soMotor ? 'Volta ao automático' : `Misturar o adubo sem abrir os setores (máx. ${config.soMotorMin} min)`}
          desabilitado={offline || enviando !== null}
          onClick={() => executar('motor', soMotor ? 'Motor desligado.' : 'Motor ligado (só motor).')}
        />
      </div>
      {status.ciclo !== 'ocioso' && !soMotor && (
        <Button variant="danger" className="w-full" disabled={offline || enviando !== null} onClick={() => executar('parar', 'Ciclo interrompido.')}>
          ⏹ Parar o ciclo agora
        </Button>
      )}

      <section>
        <h2 className="mb-2 font-serif text-lg">Setores</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {config.setores.map((s) => (
            <CartaoSetor key={s.n} setor={s} status={status} desabilitado={offline || enviando !== null} onManual={() => setManual(s)} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-serif text-lg">Últimos acontecimentos</h2>
          <Link to="/historico" className="text-sm font-medium text-brand">
            Ver tudo
          </Link>
        </div>
        <Card className="divide-y divide-line p-0">
          {(recentes.data ?? []).map((e) => (
            <p key={e.id} className="px-4 py-2 text-sm">
              <span className="mr-2 font-mono text-xs text-muted">{e.horaDispositivo}</span>
              {e.mensagem}
            </p>
          ))}
          {recentes.data?.length === 0 && <p className="px-4 py-3 text-sm text-muted">Nada por aqui ainda.</p>}
        </Card>
      </section>

      <AcionamentoManual setor={manual} onFechar={() => setManual(null)} />
    </div>
  )
}

function BotaoGrande(props: {
  ativo: boolean
  icone: string
  titulo: string
  subtitulo: string
  desabilitado: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.desabilitado}
      className={`flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition disabled:opacity-50 ${props.ativo ? 'border-brand bg-brand text-white' : 'border-line bg-white hover:border-brand'}`}
    >
      <span className="text-3xl" aria-hidden>
        {props.icone}
      </span>
      <span>
        <span className="block text-lg font-semibold">{props.titulo}</span>
        <span className={`block text-sm ${props.ativo ? 'text-white/85' : 'text-muted'}`}>{props.subtitulo}</span>
      </span>
    </button>
  )
}

function CartaoSetor({ setor, status, desabilitado, onManual }: { setor: SetorCfg; status: Status; desabilitado: boolean; onManual: () => void }) {
  const { executar } = useComando()
  const aberto = status.setores[setor.n - 1]?.aberto
  if (!setor.instalado) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-3 text-sm text-muted">
        <p className="font-semibold">{setor.nome}</p>
        <p>Não instalado</p>
      </div>
    )
  }
  return (
    <div className={`rounded-2xl border p-3 ${aberto ? 'border-agua bg-sky-50' : 'border-line bg-white'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-semibold">{setor.nome}</p>
        {aberto && <span className="pulsar text-lg" aria-label="Válvula aberta">💦</span>}
      </div>
      <p className="text-xs text-muted">{setor.tipo === 'interno' ? 'Interno' : 'Externo'}</p>
      <button
        type="button"
        disabled={desabilitado}
        onClick={() => executar(`bloco ${setor.n} ${setor.mudas ? 'vazio' : 'mudas'}`, `${setor.nome}: ${setor.mudas ? 'vazio' : 'com mudas'}.`)}
        className={`mt-2 w-full rounded-full px-2 py-1 text-xs font-semibold disabled:opacity-50 ${setor.mudas ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
        title="Tocar para alternar"
      >
        {setor.mudas ? '🌱 Com mudas' : '⚪ Vazio (não irriga)'}
      </button>
      <button
        type="button"
        disabled={desabilitado || status.ciclo !== 'ocioso' || status.modo !== 'AUTOMATICO'}
        onClick={onManual}
        className="mt-1.5 w-full rounded-full border border-line px-2 py-1 text-xs font-semibold text-brand disabled:opacity-40"
      >
        Acionar agora
      </button>
    </div>
  )
}

function AcionamentoManual({ setor, onFechar }: { setor: SetorCfg | null; onFechar: () => void }) {
  const { executar, enviando } = useComando()
  const [segundos, setSegundos] = useState(30)
  if (!setor) return null
  return (
    <Modal aberto onFechar={onFechar} titulo={`Acionar ${setor.nome}`}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Abre a válvula deste setor e liga a bomba pelo tempo escolhido. Funciona mesmo com o bloco marcado como vazio.
        </p>
        <div className="flex flex-wrap gap-2">
          {[15, 30, 60, 120, 300].map((s) => (
            <Button key={s} small variant={segundos === s ? 'primary' : 'secondary'} onClick={() => setSegundos(s)}>
              {s < 60 ? `${s} s` : `${s / 60} min`}
            </Button>
          ))}
        </div>
        <Field label="Segundos">
          <input className={inputCls} type="number" min={1} max={3600} value={segundos} onChange={(e) => setSegundos(Number(e.target.value))} />
        </Field>
        <Button
          className="w-full"
          disabled={enviando !== null || segundos < 1 || segundos > 3600}
          onClick={async () => {
            if (await executar(`setor ${setor.n} ${segundos}`, `${setor.nome} acionado por ${segundos} s.`)) onFechar()
          }}
        >
          Acionar por {segundos} s
        </Button>
      </div>
    </Modal>
  )
}
