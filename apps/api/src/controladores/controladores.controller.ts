import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { filter, interval, map, merge, type Observable } from 'rxjs';
import { Roles, type UsuarioLogado } from '../common/decorators.js';
import { PrismaService } from '../common/prisma.service.js';
import { validarComando } from './comandos.js';
import { MqttService } from './mqtt.service.js';

class ComandoDto {
  @IsString() @MinLength(1) @MaxLength(400) texto: string;
}

class CriarControladorDto {
  @IsString() @MinLength(2) nome: string;
  @IsString()
  @Matches(/^[a-zA-Z0-9_\-/]+$/, { message: 'Prefixo: use letras, números, "-", "_" e "/".' })
  prefixo: string;
}

const resumo = {
  id: true,
  nome: true,
  prefixo: true,
  online: true,
  vistoEm: true,
  ultimoStatus: true,
  ultimaConfig: true,
} as const;

@Controller('controladores')
export class ControladoresController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mqtt: MqttService,
  ) {}

  @Get()
  async listar() {
    const lista = await this.prisma.controlador.findMany({ select: resumo, orderBy: { nome: 'asc' } });
    return lista.map((c) => ({ ...c, brokerConectado: this.mqtt.conectado }));
  }

  @Roles('ADMIN')
  @Post()
  async criar(@Body() dto: CriarControladorDto) {
    const c = await this.prisma.controlador.create({
      data: { nome: dto.nome.trim(), prefixo: dto.prefixo.trim() },
      select: resumo,
    });
    this.mqtt.acompanhar(c.id, c.prefixo);
    return c;
  }

  @Get(':id')
  async detalhe(@Param('id') id: string) {
    const c = await this.prisma.controlador.findUniqueOrThrow({ where: { id }, select: resumo });
    return { ...c, brokerConectado: this.mqtt.conectado };
  }

  /** Histórico, do mais recente para o mais antigo. `antes` = id do último evento já carregado. */
  @Get(':id/eventos')
  eventos(@Param('id') id: string, @Query('antes') antes?: string, @Query('limite') limite?: string) {
    const n = Math.min(Math.max(Number(limite) || 50, 1), 200);
    return this.prisma.evento.findMany({
      where: { controladorId: id, ...(antes ? { id: { lt: Number(antes) } } : {}) },
      orderBy: { id: 'desc' },
      take: n,
      select: { id: true, recebidoEm: true, horaDispositivo: true, mensagem: true },
    });
  }

  @Get(':id/comandos')
  comandos(@Param('id') id: string, @Query('antes') antes?: string) {
    return this.prisma.comando.findMany({
      where: { controladorId: id, ...(antes ? { id: { lt: Number(antes) } } : {}) },
      orderBy: { id: 'desc' },
      take: 50,
      select: {
        id: true,
        texto: true,
        resposta: true,
        enviadoEm: true,
        respondidoEm: true,
        usuario: { select: { nome: true } },
      },
    });
  }

  @Post(':id/comandos')
  @HttpCode(200)
  enviar(@Param('id') id: string, @Body() dto: ComandoDto, @Req() req: { user: UsuarioLogado }) {
    const v = validarComando(dto.texto, req.user.perfil);
    if (!v.ok) throw new BadRequestException(v.erro);
    return this.mqtt.enviar(id, v.texto, req.user.id);
  }

  /** Tempo real (Server-Sent Events): status, config, conexão e eventos deste controlador. */
  @Sse(':id/tempo-real')
  tempoReal(@Param('id') id: string): Observable<MessageEvent> {
    const mensagens = this.mqtt.tempoReal$.pipe(
      filter((m) => m.controladorId === id),
      map((m) => ({ type: m.tipo, data: m.dados }) as MessageEvent),
    );
    // Um "ping" a cada 25 s evita que proxies derrubem a conexão parada.
    const ping = interval(25_000).pipe(map(() => ({ type: 'ping', data: {} }) as MessageEvent));
    return merge(mensagens, ping);
  }
}
