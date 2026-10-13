import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { FlowsModule } from '../flows/flows.module.js';
import { RiskFindingDetailService } from './risk-finding-detail.service.js';
import { RiskFindingsService } from './risk-findings.service.js';
import { RiskWarningService } from './risk-warning.service.js';
import { RiskScoringService } from './risk-scoring.service.js';
import { RiskSummaryService } from './risk-summary.service.js';
import { RiskController } from './risk.controller.js';
import { RiskRepository } from './risk.repository.js';

@Module({
  imports: [FlowsModule],
  controllers: [RiskController],
  providers: [RiskRepository, RiskWarningService, RiskScoringService, RiskSummaryService, RiskFindingsService, RiskFindingDetailService, { provide: CLOCK, useValue: systemClock }],
  exports: [RiskScoringService, RiskRepository],
})
export class RiskModule {}
