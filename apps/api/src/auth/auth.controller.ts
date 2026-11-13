import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { Public, type UsuarioLogado } from '../common/decorators.js';
import { AuthService } from './auth.service.js';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) senha: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.senha);
  }

  @Get('me')
  me(@Req() req: { user: UsuarioLogado }) {
    return this.auth.me(req.user.id);
  }
}
