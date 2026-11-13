import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';

/** Traduz erros comuns do Prisma em respostas HTTP legíveis e registra o código no log do servidor. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('Prisma');

  catch(erro: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const [status, message] =
      erro.code === 'P2002'
        ? [HttpStatus.CONFLICT, 'Já existe um registro com esse valor (campo único).']
        : erro.code === 'P2025'
          ? [HttpStatus.NOT_FOUND, 'Registro não encontrado.']
          : erro.code === 'P2003'
            ? [HttpStatus.CONFLICT, 'Registro vinculado a outros dados.']
            : erro.code === 'P2028'
              ? [HttpStatus.SERVICE_UNAVAILABLE, 'O banco demorou para responder. Tente novamente em instantes.']
              : [HttpStatus.INTERNAL_SERVER_ERROR, 'Erro ao acessar o banco de dados.'];

    if (status >= 500) this.log.error(`${erro.code}: ${erro.message.split('\n').slice(-3).join(' ')} ${JSON.stringify(erro.meta ?? {})}`);
    res.status(status).json({ statusCode: status, message, ...(status >= 500 ? { codigo: erro.code } : {}) });
  }
}
