import { useState } from 'react'
import { useAuth } from '../auth'
import { Button, Card, Field, PageHeader, Vazio, inputCls } from '../components/ui'
import { useControlador } from '../controlador'
import { useComando } from '../hooks'
import type { SetorCfg, TipoSetor } from '../types'

export default function Setores() {
  const { usuario } = useAuth()
  const { controlador } = useControlador()
  const config = controlador.ultimaConfig
  if (!config) return <Vazio>Ainda não recebemos a configuração do controlador.</Vazio>
  const admin = usuario?.perfil === 'ADMIN'

  return (
    <div>
      <PageHeader titulo="Setores" />
      <p className="mb-4 text-sm text-muted">
        Cada setor é uma solenoide. Bloco <b>vazio</b> nunca abre nas rotinas (nem na adubação); setor <b>não instalado</b> nunca abre.
      </p>
      <div className="space-y-3">
        {config.setores.map((s) => (
          <FormSetor key={`${s.n}-${s.nome}-${s.tipo}-${s.instalado}-${s.mudas}`} setor={s} admin={admin} />
        ))}
      </div>
    </div>
  )
}

function FormSetor({ setor, admin }: { setor: SetorCfg; admin: boolean }) {
  const { executar, enviando } = useComando()
  const [s, setS] = useState(setor)
  const mudou = JSON.stringify(s) !== JSON.stringify(setor)

  async function salvar() {
    const { n, ...resto } = s
    await executar(`setorcfg ${n} ${JSON.stringify({ ...resto, nome: resto.nome.trim() })}`, `${s.nome} salvo.`)
  }

  return (
    <Card>
      <div className="grid items-end gap-3 sm:grid-cols-[3rem_1fr_9rem]">
        <p className="font-mono text-lg text-muted">#{s.n}</p>
        <Field label="Nome">
          <input className={inputCls} maxLength={23} disabled={!admin} value={s.nome} onChange={(e) => setS({ ...s, nome: e.target.value })} />
        </Field>
        <Field label="Tipo">
          <select className={inputCls} disabled={!admin} value={s.tipo} onChange={(e) => setS({ ...s, tipo: e.target.value as TipoSetor })}>
            <option value="interno">Interno</option>
            <option value="externo">Externo</option>
          </select>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" disabled={!admin} checked={s.instalado} onChange={(e) => setS({ ...s, instalado: e.target.checked })} />
          Instalado
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={s.mudas} onChange={(e) => setS({ ...s, mudas: e.target.checked })} />
          Com mudas
        </label>
        {mudou && (
          <Button
            small
            className="ml-auto"
            disabled={enviando !== null || !s.nome.trim()}
            onClick={() =>
              admin ? salvar() : executar(`bloco ${s.n} ${s.mudas ? 'mudas' : 'vazio'}`, `${s.nome}: ${s.mudas ? 'com mudas' : 'vazio'}.`)
            }
          >
            Salvar
          </Button>
        )}
      </div>
    </Card>
  )
}
