export type Perfil = 'ADMIN' | 'OPERADOR'

export type Usuario = { id: string; nome: string; email: string; perfil: Perfil }
export type UsuarioAdmin = Usuario & { ativo: boolean; criadoEm: string }

export type Modo = 'AUTOMATICO' | 'PAUSA VISITA' | 'SO MOTOR'

export type SetorStatus = { n: number; aberto: boolean; mudas: boolean; instalado: boolean }

/** Publicado pelo ESP32 em <prefixo>/status. */
export type Status = {
  modo: Modo
  ciclo: string
  rotinaId?: number
  rotina?: string
  bomba: boolean
  setores: SetorStatus[]
  hora?: string
  modoRestanteS?: number
  uptimeS?: number
  wifiRssi?: number
}

export type TipoSetor = 'interno' | 'externo'
export type SetorCfg = { n: number; nome: string; tipo: TipoSetor; instalado: boolean; mudas: boolean }

export type TipoRotina = 'irrigacao' | 'adubacao' | 'climatizacao'
export type Dia = 'dom' | 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab'

export type Rotina = {
  id: number
  nome: string
  tipo: TipoRotina
  dias: 'todos' | Dia[]
  inicio: string
  fim: string
  ligado: number
  pausa: number
  mistura?: number
  setores: number[]
  ativa: boolean
}

/** Publicado pelo ESP32 em <prefixo>/config. */
export type Config = {
  versao: number
  pausaVisitaMin: number
  soMotorMin: number
  setores: SetorCfg[]
  rotinas: Rotina[]
}

export type Controlador = {
  id: string
  nome: string
  prefixo: string
  online: boolean
  vistoEm: string | null
  ultimoStatus: Status | null
  ultimaConfig: Config | null
  brokerConectado: boolean
}

export type Evento = { id: number; recebidoEm: string; horaDispositivo: string; mensagem: string }

export type ComandoLog = {
  id: number
  texto: string
  resposta: string | null
  enviadoEm: string
  respondidoEm: string | null
  usuario: { nome: string }
}

export type RespostaComando = { saida: string; erro: boolean }
