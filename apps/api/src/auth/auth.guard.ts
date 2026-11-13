import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC, ROLES } from '../common/decorators.js';
import type { PerfilUsuario } from '../generated/prisma/enums.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const alvos = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, alvos)) return true;

    const req = context.switchToHttp().getRequest();
    const [tipo, tokenCabecalho] = (req.headers.authorization ?? '').split(' ');
    // O EventSource do navegador (tempo real) não manda cabeçalhos: aceita ?token= só em GET.
    const token =
      tipo === 'Bearer' && tokenCabecalho
        ? tokenCabecalho
        : req.method === 'GET' && typeof req.query?.token === 'string'
          ? req.query.token
          : null;
    if (!token) throw new UnauthorizedException();

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; perfil: PerfilUsuario }>(token);
      req.user = { id: payload.sub, perfil: payload.perfil };
    } catch {
      throw new UnauthorizedException();
    }

    const perfis = this.reflector.getAllAndOverride<PerfilUsuario[]>(ROLES, alvos);
    if (perfis?.length && !perfis.includes(req.user.perfil)) {
      throw new ForbiddenException('Sem permissão para esta ação.');
    }
    return true;
  }
}
