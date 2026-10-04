import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { SnapshotFreshness } from '../tokens/snapshot-freshness.js';
import { FlowSummaryService } from './flow-summary.service.js';
import { FlowsController } from './flows.controller.js';
import { FlowsRepository } from './flows.repository.js';
import { TraceService } from './trace.service.js';
import { TracesController } from './traces.controller.js';

@Module({
  controllers: [FlowsController, TracesController],
  providers: [FlowsRepository, FlowSummaryService, TraceService, SnapshotFreshness, { provide: CLOCK, useValue: systemClock }],
})
export class FlowsModule {}
