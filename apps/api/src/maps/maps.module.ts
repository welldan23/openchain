import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { MapsRepository } from './maps.repository.js';
import { WalletMapBuilder } from './wallet-map-builder.service.js';

@Module({
  providers: [MapsRepository, WalletMapBuilder, { provide: CLOCK, useValue: systemClock }],
  exports: [WalletMapBuilder],
})
export class MapsModule {}
