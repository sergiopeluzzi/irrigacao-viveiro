import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      // Em produção o banco fica longe da API (cada consulta leva ~200 ms): o limite padrão de 5 s é curto.
      transactionOptions: { timeout: 30_000, maxWait: 10_000 },
      // PRISMA_LOG=query mostra cada consulta (útil para contar idas e voltas ao banco).
      ...(process.env.PRISMA_LOG === 'query' ? { log: ['query' as const] } : {}),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
