import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { FlowsModule } from '../flows/flows.module.js';
import { SnapshotFreshness } from '../tokens/snapshot-freshness.js';
import { CoordinationFindingService } from './coordination-finding.service.js';
import { CoordinationService } from './coordination.service.js';
import { EntityLabelService } from './entity-label.service.js';
import { MapsController } from './maps.controller.js';
import { MapsRepository } from './maps.repository.js';
import { WalletClusterService } from './wallet-cluster.service.js';
import { WalletMapBuilder } from './wallet-map-builder.service.js';
import { WalletMapEdgeService } from './wallet-map-edge.service.js';
import { WalletMapService } from './wallet-map.service.js';

@Module({
  imports: [FlowsModule],
  controllers: [MapsController],
  providers: [MapsRepository, WalletMapBuilder, WalletMapService, WalletMapEdgeService, WalletClusterService, EntityLabelService, CoordinationService, CoordinationFindingService, SnapshotFreshness, { provide: CLOCK, useValue: systemClock }],
  exports: [WalletMapBuilder],
})
export class MapsModule {}
