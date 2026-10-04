import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { SnapshotFreshness } from '../tokens/snapshot-freshness.js';
import { FlowChainsService } from './flow-chains.service.js';
import { FlowLookupService } from './flow-lookup.service.js';
import { FlowSummaryService } from './flow-summary.service.js';
import { FlowTransfersService } from './flow-transfers.service.js';
import { FlowsController } from './flows.controller.js';
import { FlowsRepository } from './flows.repository.js';
import { TraceService } from './trace.service.js';
import { TracesController } from './traces.controller.js';
import { TransactionEvidenceService } from './transaction-evidence.service.js';
import { TransactionsController } from './transactions.controller.js';

@Module({
  controllers: [FlowsController, TracesController, TransactionsController],
  providers: [FlowsRepository, FlowLookupService, FlowSummaryService, FlowTransfersService, FlowChainsService, TraceService, TransactionEvidenceService, SnapshotFreshness, { provide: CLOCK, useValue: systemClock }],
})
export class FlowsModule {}
