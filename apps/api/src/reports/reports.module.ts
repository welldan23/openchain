import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { CasesModule } from '../cases/cases.module.js';
import { FlowsModule } from '../flows/flows.module.js';
import { RiskModule } from '../risk/risk.module.js';
import { ReportComposeService } from './report-compose.service.js';
import { ReportEvidenceService } from './report-evidence.service.js';
import { ReportExportService } from './report-export.service.js';
import { ReportNotesService } from './report-notes.service.js';
import { PublicReportsController } from './public-reports.controller.js';
import { ReportShareService } from './report-share.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [FlowsModule, CasesModule, RiskModule],
  controllers: [ReportsController, PublicReportsController],
  providers: [ReportsService, ReportsRepository, ReportComposeService, ReportEvidenceService, ReportNotesService, ReportExportService, ReportShareService, { provide: CLOCK, useValue: systemClock }],
  exports: [ReportsService, ReportsRepository],
})
export class ReportsModule {}
