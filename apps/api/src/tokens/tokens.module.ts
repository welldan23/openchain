import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { TokenSummaryService } from './token-summary.service.js';
import { TokensController } from './tokens.controller.js';
import { TokensRepository } from './tokens.repository.js';

@Module({
  controllers: [TokensController],
  providers: [TokensRepository, TokenSummaryService, { provide: CLOCK, useValue: systemClock }],
})
export class TokensModule {}
