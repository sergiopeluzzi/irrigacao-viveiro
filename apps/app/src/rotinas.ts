import type { Dia, Rotina, SetorCfg, TipoRotina } from './types'

export const DIAS: { id: Dia; curto: string }[] = [
  { id: 'dom', curto: 'Dom' },
  { id: 'seg', curto: 'Seg' },
  { id: 'ter', curto: 'Ter' },
  { id: 'qua', curto: 'Qua' },
  { id: 'qui', curto: 'Qui' },
  { id: 'sex', curto: 'Sex' },
  { id: 'sab', curto: 'Sáb' },
]

export const TIPOS: Record<TipoRotina, { rotulo: string; cor: string }> = {
  irrigacao: { rotulo: 'Irrigação', cor: 'bg-sky-100 text-sky-800' },
  adubacao: { rotulo: 'Adubação', cor: 'bg-amber-100 text-amber-800' },
  climatizacao: { rotulo: 'Climatização', cor: 'bg-violet-100 text-violet-800' },
}

// Mesmos tempos de segurança do firmware: abre a válvula 1 s antes e fecha 2 s depois da bomba.
const SEGURANCA_S = 3

export const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function duracao(s: number) {
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return r ? `${m} min ${r} s` : `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

export function textoDias(dias: Rotina['dias']) {
  if (dias === 'todos' || dias.length === 7) return 'todos os dias'
  return DIAS.filter((d) => dias.includes(d.id))
    .map((d) => d.curto)
    .join(', ')
}

const fmt = (totalS: number) => {
  const s = ((totalS % 86400) + 86400) % 86400
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
}

/** Mesma conta da prévia do firmware: quantos ciclos cabem na janela e quando começam. */
export function previa(r: Pick<Rotina, 'inicio' | 'fim' | 'ligado' | 'pausa' | 'setores' | 'tipo' | 'mistura'>, setores: SetorCfg[]) {
  const ativos = r.setores.filter((n) => setores[n - 1]?.instalado && setores[n - 1]?.mudas).length
  if (!ativos || !r.ligado || r.inicio === r.fim) return { ativos, ciclos: 0, duracaoCiclo: 0, horarios: [] as string[] }
  const janela = ((minutos(r.fim) - minutos(r.inicio) + 1440) % 1440) * 60
  const duracaoCiclo = SEGURANCA_S + ativos * r.ligado
  const horarios: string[] = []
  let t = 0
  let ciclos = 0
  while (t < janela) {
    if (horarios.length < 12) horarios.push(fmt(minutos(r.inicio) * 60 + t))
    ciclos++
    t += duracaoCiclo + (ciclos === 1 && r.tipo === 'adubacao' ? (r.mistura ?? 0) : 0) + r.pausa
    if (r.pausa === 0) break
  }
  return { ativos, ciclos, duracaoCiclo, horarios }
}

const DIA_IDX: Dia[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

/** Próxima rotina ativa a começar (ou a que está com a janela aberta agora). */
export function proximaRotina(rotinas: Rotina[], agora = new Date()) {
  let melhor: { rotina: Rotina; inicio: Date; fim: Date; emAndamento: boolean } | null = null
  for (const r of rotinas.filter((x) => x.ativa)) {
    for (let off = -1; off <= 7; off++) {
      const dia = new Date(agora)
      dia.setDate(dia.getDate() + off)
      if (r.dias !== 'todos' && !r.dias.includes(DIA_IDX[dia.getDay()])) continue
      const inicio = new Date(dia)
      inicio.setHours(0, minutos(r.inicio), 0, 0)
      const fim = new Date(inicio.getTime() + ((minutos(r.fim) - minutos(r.inicio) + 1440) % 1440) * 60_000)
      if (fim <= agora) continue
      const emAndamento = inicio <= agora
      const candidato = { rotina: r, inicio, fim, emAndamento }
      if (!melhor || (emAndamento && !melhor.emAndamento) || (emAndamento === melhor.emAndamento && inicio < melhor.inicio)) {
        melhor = candidato
      }
      break
    }
  }
  return melhor
}

export const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
