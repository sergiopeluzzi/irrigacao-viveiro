import { useState } from 'react'
import { useAviso } from './components/Aviso'
import { useControlador } from './controlador'

/** Limpa o texto do firmware para mostrar ao usuário (tira o carimbo de hora de cada linha). */
export const limparSaida = (saida: string) =>
  saida
    .split('\n')
    .map((l) => l.replace(/^\[\d\d:\d\d:\d\d\]\s*/, '').trim())
    .filter(Boolean)
    .join('\n')

/**
 * Envia um comando ao controlador e mostra o resultado num aviso.
 * Devolve true se o controlador aceitou.
 */
export function useComando() {
  const { enviar } = useControlador()
  const avisar = useAviso()
  const [enviando, setEnviando] = useState<string | null>(null)

  async function executar(texto: string, sucesso?: string) {
    setEnviando(texto)
    try {
      const r = await enviar(texto)
      const msg = limparSaida(r.saida)
      if (r.erro) avisar(msg || 'O controlador recusou o comando.', true)
      else avisar(sucesso ?? (msg.split('\n')[0] || 'Feito.'))
      return !r.erro
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Falha ao enviar o comando.', true)
      return false
    } finally {
      setEnviando(null)
    }
  }

  return { executar, enviando }
}

export function tempoRelativo(iso: string | null) {
  if (!iso) return 'nunca'
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 10) return 'agora'
  if (s < 60) return `há ${s} s`
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
