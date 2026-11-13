import { Module } from '@nestjs/common';
import { SaudeController } from '../saude.controller.js';
import { ControladoresController } from './controladores.controller.js';
import { MqttService } from './mqtt.service.js';

@Module({
  controllers: [ControladoresController, SaudeController],
  providers: [MqttService],
})
export class ControladoresModule {}
