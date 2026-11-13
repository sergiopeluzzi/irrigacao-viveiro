import { respostaEhErro, validarComando } from './comandos.js';

describe('validarComando', () => {
  it('operador pode pausar, acionar setor e marcar bloco', () => {
    expect(validarComando('pausa', 'OPERADOR')).toEqual({ ok: true, texto: 'pausa' });
    expect(validarComando('  setor 1 30 ', 'OPERADOR')).toEqual({ ok: true, texto: 'setor 1 30' });
    expect(validarComando('bloco 2 vazio', 'OPERADOR').ok).toBe(true);
  });

  it('operador não pode mudar rotinas nem reiniciar', () => {
    expect(validarComando('rotina {"id":1,"ligado":45}', 'OPERADOR')).toEqual({
      ok: false,
      erro: 'Só administradores podem usar esse comando.',
    });
    expect(validarComando('reiniciar', 'OPERADOR').ok).toBe(false);
  });

  it('admin pode tudo que o firmware conhece', () => {
    expect(validarComando('rotina {"id":1,"ligado":45}', 'ADMIN').ok).toBe(true);
    expect(validarComando('fabrica', 'ADMIN').ok).toBe(true);
  });

  it('recusa comando desconhecido, vazio, com quebra de linha ou longo demais', () => {
    expect(validarComando('rm -rf', 'ADMIN').ok).toBe(false);
    expect(validarComando('   ', 'ADMIN').ok).toBe(false);
    expect(validarComando('pausa\nreiniciar', 'ADMIN').ok).toBe(false);
    expect(validarComando('status ' + 'x'.repeat(400), 'ADMIN').ok).toBe(false);
  });
});

describe('respostaEhErro', () => {
  it('reconhece as mensagens de erro do firmware', () => {
    expect(respostaEhErro('Erro: inicio invalido (HH:MM)\n')).toBe(true);
    expect(respostaEhErro('JSON invalido.\n')).toBe(true);
    expect(respostaEhErro('[07:00:00] Ocupado: aguarde o ciclo atual ou saia do modo AUTOMATICO\n')).toBe(true);
    expect(respostaEhErro('[07:00:00] Rotina #4 criada e salva\n')).toBe(false);
  });
});
