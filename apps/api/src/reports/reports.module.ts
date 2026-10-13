import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { CasesModule } from '../cases/cases.module.js';
import { FlowsModule } from '../flows/flows.module.js';
import { RiskModule } from '../risk/risk.module.js';
import { ReportComposeService } from './report-compose.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [FlowsModule, CasesModule, RiskModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository, ReportComposeService, { provide: CLOCK, useValue: systemClock }],
  exports: [ReportsService, ReportsRepository],
})
export class ReportsModule {}
