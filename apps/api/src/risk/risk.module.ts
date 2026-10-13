import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { FlowsModule } from '../flows/flows.module.js';
import { RiskScoringService } from './risk-scoring.service.js';
import { RiskSummaryService } from './risk-summary.service.js';
import { RiskController } from './risk.controller.js';
import { RiskRepository } from './risk.repository.js';

@Module({
  imports: [FlowsModule],
  controllers: [RiskController],
  providers: [RiskRepository, RiskScoringService, RiskSummaryService, { provide: CLOCK, useValue: systemClock }],
  exports: [RiskScoringService, RiskRepository],
})
export class RiskModule {}
