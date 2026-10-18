import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, { provide: CLOCK, useValue: systemClock }],
  exports: [AuthService, AuthRepository],
})
export class AuthModule {}
