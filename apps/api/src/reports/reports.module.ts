import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { FlowsModule } from '../flows/flows.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [FlowsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository, { provide: CLOCK, useValue: systemClock }],
  exports: [ReportsService, ReportsRepository],
})
export class ReportsModule {}
