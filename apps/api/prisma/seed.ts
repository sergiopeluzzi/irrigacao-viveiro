import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '');
if (!local && !process.env.SEED_ADMIN_SENHA) {
  throw new Error('Defina SEED_ADMIN_SENHA: fora do banco local o seed não usa senha padrão.');
}
const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@viveiro.local').toLowerCase();
const prefixo = process.env.SEED_CONTROLADOR_PREFIXO ?? 'viveiro-cafe/proto-bea19c';

await prisma.usuario.upsert({
  where: { email },
  update: {},
  create: {
    nome: process.env.SEED_ADMIN_NOME ?? 'Administrador',
    email,
    senhaHash: await bcrypt.hash(process.env.SEED_ADMIN_SENHA ?? 'trocar123', 10),
    perfil: 'ADMIN',
  },
});

await prisma.controlador.upsert({
  where: { prefixo },
  update: {},
  create: { nome: process.env.SEED_CONTROLADOR_NOME ?? 'Viveiro', prefixo },
});

console.log(`Seed ok: admin ${email}, controlador ${prefixo}`);
await prisma.$disconnect();
