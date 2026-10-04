import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { SnapshotFreshness } from '../tokens/snapshot-freshness.js';
import { FlowSummaryService } from './flow-summary.service.js';
import { FlowsController } from './flows.controller.js';
import { FlowsRepository } from './flows.repository.js';

@Module({
  controllers: [FlowsController],
  providers: [FlowsRepository, FlowSummaryService, SnapshotFreshness, { provide: CLOCK, useValue: systemClock }],
})
export class FlowsModule {}
