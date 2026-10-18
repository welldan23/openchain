import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CLOCK, systemClock } from '../common/clock.js';
import { AccountController } from './account.controller.js';
import { AccountRepository } from './account.repository.js';
import { AccountService } from './account.service.js';
import { DataSourcesService, SERVER_ENV } from './data-sources.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AccountController],
  providers: [AccountService, DataSourcesService, AccountRepository, { provide: CLOCK, useValue: systemClock }, { provide: SERVER_ENV, useValue: process.env }],
})
export class AccountModule {}
