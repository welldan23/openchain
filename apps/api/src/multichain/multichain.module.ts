import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { FlowsModule } from '../flows/flows.module.js';
import { SnapshotFreshness } from '../tokens/snapshot-freshness.js';
import { BridgeDetectionService } from './bridge-detection.service.js';
import { MultichainController } from './multichain.controller.js';
import { MultichainRepository } from './multichain.repository.js';
import { MultichainService } from './multichain.service.js';

@Module({
  imports: [FlowsModule],
  controllers: [MultichainController],
  providers: [MultichainRepository, MultichainService, BridgeDetectionService, SnapshotFreshness, { provide: CLOCK, useValue: systemClock }],
})
export class MultichainModule {}
