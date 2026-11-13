import {
  GatewayTimeoutException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { connect, type MqttClient } from 'mqtt';
import { Subject } from 'rxjs';
import { PrismaService } from '../common/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { respostaEhErro } from './comandos.js';

export type TempoReal =
  | { controladorId: string; tipo: 'conexao'; dados: { online: boolean } }
  | { controladorId: string; tipo: 'status' | 'config'; dados: unknown }
  | { controladorId: string; tipo: 'evento'; dados: { id: number; recebidoEm: Date; horaDispositivo: string; mensagem: string } };

type Pendente = { texto: string; resolver: (saida: string) => void };

const ESPERA_RESPOSTA_MS = 15_000;

/**
 * Ponte entre o broker MQTT e a API: assina <prefixo>/# de cada controlador, guarda status,
 * configuração e histórico no banco, repassa tudo em tempo real (SSE) e envia comandos.
 * O navegador nunca fala direto com o broker (as credenciais ficam só aqui).
 */
@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('MQTT');
  private cliente: MqttClient | null = null;
  private readonly prefixos = new Map<string, string>(); // prefixo -> controladorId
  private readonly pendentes = new Map<string, Pendente[]>(); // controladorId -> comandos aguardando resposta
  private readonly assinadoEm = new Map<string, number>(); // prefixo -> quando assinamos (Date.now)
  readonly tempoReal$ = new Subject<TempoReal>();

  constructor(private readonly prisma: PrismaService) {}

  get conectado() {
    return this.cliente?.connected ?? false;
  }

  async onModuleInit() {
    for (const c of await this.prisma.controlador.findMany({ select: { id: true, prefixo: true } })) {
      this.prefixos.set(c.prefixo, c.id);
    }
    const url = process.env.MQTT_URL || 'mqtt://broker.hivemq.com:1883';
    this.cliente = connect(url, {
      username: process.env.MQTT_USUARIO || undefined,
      password: process.env.MQTT_SENHA || undefined,
      clientId: `api-viveiro-${randomBytes(4).toString('hex')}`,
      reconnectPeriod: 5_000,
      connectTimeout: 10_000,
    });
    this.cliente.on('connect', () => {
      this.log.log(`Conectado a ${url} (${this.prefixos.size} controlador(es))`);
      for (const p of this.prefixos.keys()) this.assinar(p);
    });
    this.cliente.on('error', (e) => this.log.warn(`Erro: ${e.message}`));
    this.cliente.on('offline', () => this.log.warn('Sem conexão com o broker; tentando de novo...'));
    this.cliente.on('message', (topico, payload, pacote) => {
      this.aoReceber(topico, payload.toString('utf8'), pacote.retain).catch((e: Error) =>
        this.log.error(`Falha ao processar ${topico}: ${e.message}`),
      );
    });
  }

  async onModuleDestroy() {
    await this.cliente?.endAsync();
  }

  /** Passa a acompanhar um controlador recém-cadastrado. */
  acompanhar(controladorId: string, prefixo: string) {
    this.prefixos.set(prefixo, controladorId);
    if (this.conectado) this.assinar(prefixo);
  }

  private assinar(prefixo: string) {
    this.assinadoEm.set(prefixo, Date.now());
    this.cliente?.subscribe(`${prefixo}/#`, { qos: 1 });
  }

  private async aoReceber(topico: string, payload: string, flagRetain: boolean) {
    const prefixo = [...this.prefixos.keys()].find((p) => topico.startsWith(`${p}/`));
    if (!prefixo) return;
    // Mensagem retida = estado antigo guardado no broker, entregue logo após assinarmos: não prova que o
    // controlador está vivo. (Alguns brokers marcam "retain" até nas mensagens ao vivo, por isso o prazo.)
    const retida = flagRetain && Date.now() - (this.assinadoEm.get(prefixo) ?? 0) < 5_000;
    const controladorId = this.prefixos.get(prefixo)!;
    const sufixo = topico.slice(prefixo.length + 1);

    switch (sufixo) {
      case 'conexao': {
        const online = payload === 'online';
        await this.prisma.controlador.update({
          where: { id: controladorId },
          data: { online, ...(online && !retida ? { vistoEm: new Date() } : {}) },
        });
        this.tempoReal$.next({ controladorId, tipo: 'conexao', dados: { online } });
        break;
      }
      case 'status':
      case 'config': {
        const dados = lerJson(payload);
        if (dados === undefined || dados === null) return;
        await this.prisma.controlador.update({
          where: { id: controladorId },
          data:
            sufixo === 'status'
              ? { ultimoStatus: dados, ...(retida ? {} : { vistoEm: new Date() }) }
              : { ultimaConfig: dados },
        });
        this.tempoReal$.next({ controladorId, tipo: sufixo, dados });
        break;
      }
      case 'evento': {
        const dados = lerJson(payload) as { hora?: string; msg?: string } | undefined;
        if (!dados?.msg) return;
        const [evento] = await this.prisma.$transaction([
          this.prisma.evento.create({
            data: { controladorId, horaDispositivo: dados.hora ?? '', mensagem: dados.msg },
            select: { id: true, recebidoEm: true, horaDispositivo: true, mensagem: true },
          }),
          this.prisma.controlador.update({ where: { id: controladorId }, data: { vistoEm: new Date() } }),
        ]);
        this.tempoReal$.next({ controladorId, tipo: 'evento', dados: evento });
        break;
      }
      case 'resposta': {
        const dados = lerJson(payload) as { cmd?: string; saida?: string } | undefined;
        const fila = this.pendentes.get(controladorId) ?? [];
        const i = fila.findIndex((p) => p.texto === dados?.cmd);
        if (i >= 0) fila.splice(i, 1)[0].resolver(dados?.saida ?? '');
        break;
      }
    }
  }

  /** Publica o comando em <prefixo>/cmd e espera a resposta do controlador. */
  async enviar(controladorId: string, texto: string, usuarioId: string) {
    const controlador = await this.prisma.controlador.findUnique({ where: { id: controladorId } });
    if (!controlador) throw new NotFoundException('Controlador não encontrado.');
    if (!this.conectado) throw new ServiceUnavailableException('A API está sem conexão com o broker MQTT.');

    const registro = await this.prisma.comando.create({ data: { controladorId, usuarioId, texto } });
    const fila = this.pendentes.get(controladorId) ?? [];
    this.pendentes.set(controladorId, fila);

    let pendente: Pendente | undefined;
    const resposta = new Promise<string | null>((resolve) => {
      pendente = { texto, resolver: resolve };
      fila.push(pendente);
      setTimeout(() => resolve(null), ESPERA_RESPOSTA_MS);
    });
    await this.cliente!.publishAsync(`${controlador.prefixo}/cmd`, texto, { qos: 1 });

    const saida = await resposta;
    const i = fila.indexOf(pendente!);
    if (i >= 0) fila.splice(i, 1);
    await this.prisma.comando.update({
      where: { id: registro.id },
      data: { resposta: saida, respondidoEm: saida === null ? null : new Date() },
    });
    if (saida === null) {
      throw new GatewayTimeoutException(
        controlador.online
          ? 'O controlador não respondeu a tempo. Confira o histórico em instantes.'
          : 'O controlador está offline. O comando não foi executado.',
      );
    }
    return { saida, erro: respostaEhErro(saida) };
  }
}

function lerJson(texto: string): Prisma.InputJsonValue | null | undefined {
  try {
    return JSON.parse(texto);
  } catch {
    return undefined;
  }
}
