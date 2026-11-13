import { SetMetadata } from '@nestjs/common';
import type { PerfilUsuario } from '../generated/prisma/enums.js';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
export const Roles = (...perfis: PerfilUsuario[]) => SetMetadata(ROLES, perfis);

export type UsuarioLogado = { id: string; perfil: PerfilUsuario };
