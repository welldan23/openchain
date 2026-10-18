import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CLOCK, systemClock } from '../common/clock.js';
import { AccountController } from './account.controller.js';
import { AccountRepository } from './account.repository.js';
import { AccountService } from './account.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AccountController],
  providers: [AccountService, AccountRepository, { provide: CLOCK, useValue: systemClock }],
})
export class AccountModule {}
