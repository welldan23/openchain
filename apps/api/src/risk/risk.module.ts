import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { RiskScoringService } from './risk-scoring.service.js';
import { RiskRepository } from './risk.repository.js';

@Module({
  providers: [RiskRepository, RiskScoringService, { provide: CLOCK, useValue: systemClock }],
  exports: [RiskScoringService, RiskRepository],
})
export class RiskModule {}
