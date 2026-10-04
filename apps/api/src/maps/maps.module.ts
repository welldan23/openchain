import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { SnapshotFreshness } from '../tokens/snapshot-freshness.js';
import { MapsController } from './maps.controller.js';
import { MapsRepository } from './maps.repository.js';
import { WalletMapBuilder } from './wallet-map-builder.service.js';
import { WalletMapService } from './wallet-map.service.js';

@Module({
  controllers: [MapsController],
  providers: [MapsRepository, WalletMapBuilder, WalletMapService, SnapshotFreshness, { provide: CLOCK, useValue: systemClock }],
  exports: [WalletMapBuilder],
})
export class MapsModule {}
