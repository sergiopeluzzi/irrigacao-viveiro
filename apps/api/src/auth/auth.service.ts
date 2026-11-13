import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, senha: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    const ok = usuario?.ativo && (await bcrypt.compare(senha, usuario.senhaHash));
    if (!usuario || !ok) throw new UnauthorizedException('E-mail ou senha inválidos.');

    const accessToken = await this.jwt.signAsync({ sub: usuario.id, perfil: usuario.perfil });
    return { accessToken, usuario: this.publico(usuario) };
  }

  async me(id: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id } });
    return this.publico(usuario);
  }

  private publico(u: { id: string; nome: string; email: string; perfil: string }) {
    return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil };
  }
}
