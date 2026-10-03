import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { ContractChecksService } from './contract-checks.service.js';
import { HoldersService } from './holders.service.js';
import { SnapshotFreshness } from './snapshot-freshness.js';
import { TokenLookupService } from './token-lookup.service.js';
import { TokenSummaryService } from './token-summary.service.js';
import { TokensController } from './tokens.controller.js';
import { TokensRepository } from './tokens.repository.js';

@Module({
  controllers: [TokensController],
  providers: [
    TokensRepository,
    TokenLookupService,
    SnapshotFreshness,
    TokenSummaryService,
    ContractChecksService,
    HoldersService,
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class TokensModule {}
