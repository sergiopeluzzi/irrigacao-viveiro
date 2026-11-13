import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators.js';
import { MqttService } from './controladores/mqtt.service.js';

/** Usado pelo Render (health check) e pelo "despertador" do plano grátis. */
@Controller('saude')
export class SaudeController {
  constructor(private readonly mqtt: MqttService) {}

  @Public()
  @Get()
  saude() {
    return { ok: true, mqtt: this.mqtt.conectado };
  }
}
