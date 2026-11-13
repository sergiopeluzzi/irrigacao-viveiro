import type { PerfilUsuario } from '../generated/prisma/enums.js';

// Comandos de texto aceitos pelo firmware (os mesmos do Serial Monitor).
// Operador: opera o dia a dia. Admin: também muda configuração e mexe no relógio/sistema.
const DO_OPERADOR = ['status', 'rede', 'rotinas', 'config', 'prever', 'pausa', 'motor', 'parar', 'setor', 'bloco'];
const SO_ADMIN = ['rotina', 'apagar', 'ativar', 'desativar', 'setorcfg', 'param', 'hora', 'data', 'reiniciar', 'fabrica', 'ajuda'];

export type ResultadoValidacao = { ok: true; texto: string } | { ok: false; erro: string };

export function validarComando(texto: string, perfil: PerfilUsuario): ResultadoValidacao {
  const limpo = (texto ?? '').trim();
  if (!limpo) return { ok: false, erro: 'Comando vazio.' };
  if (limpo.length > 400) return { ok: false, erro: 'Comando longo demais (máx. 400 caracteres).' };
  if (/[\r\n]/.test(limpo)) return { ok: false, erro: 'O comando deve ter uma linha só.' };

  const nome = limpo.split(' ')[0].toLowerCase();
  if (DO_OPERADOR.includes(nome)) return { ok: true, texto: limpo };
  if (SO_ADMIN.includes(nome)) {
    return perfil === 'ADMIN' ? { ok: true, texto: limpo } : { ok: false, erro: 'Só administradores podem usar esse comando.' };
  }
  return { ok: false, erro: `Comando desconhecido: ${nome}` };
}

/** O firmware não devolve um código de sucesso: erros vêm como texto. */
export function respostaEhErro(saida: string): boolean {
  return /(^|\n)\s*(\[\d\d:\d\d:\d\d\] )?(Erro:|ERRO|JSON invalido|Comando desconhecido|Rotina #\d+ nao existe|Limite de rotinas|Ocupado:)/.test(
    saida,
  );
}
