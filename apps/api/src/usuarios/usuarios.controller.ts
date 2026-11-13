import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Roles } from '../common/decorators.js';
import { PrismaService } from '../common/prisma.service.js';
import { PerfilUsuario } from '../generated/prisma/enums.js';

class CriarUsuarioDto {
  @IsString() @MinLength(2) nome: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) senha: string;
  @IsEnum(PerfilUsuario) perfil: PerfilUsuario;
}

class AlterarUsuarioDto {
  @IsOptional() @IsString() @MinLength(2) nome?: string;
  @IsOptional() @IsString() @MinLength(6) senha?: string;
  @IsOptional() @IsEnum(PerfilUsuario) perfil?: PerfilUsuario;
  @IsOptional() @IsBoolean() ativo?: boolean;
}

const publico = { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true } as const;

@Roles('ADMIN')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  listar() {
    return this.prisma.usuario.findMany({ select: publico, orderBy: { nome: 'asc' } });
  }

  @Post()
  async criar(@Body() dto: CriarUsuarioDto) {
    return this.prisma.usuario.create({
      data: {
        nome: dto.nome.trim(),
        email: dto.email.trim().toLowerCase(),
        senhaHash: await bcrypt.hash(dto.senha, 10),
        perfil: dto.perfil,
      },
      select: publico,
    });
  }

  @Patch(':id')
  async alterar(@Param('id') id: string, @Body() dto: AlterarUsuarioDto) {
    return this.prisma.usuario.update({
      where: { id },
      data: {
        nome: dto.nome?.trim(),
        perfil: dto.perfil,
        ativo: dto.ativo,
        ...(dto.senha ? { senhaHash: await bcrypt.hash(dto.senha, 10) } : {}),
      },
      select: publico,
    });
  }
}
