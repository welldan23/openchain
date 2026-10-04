import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { ChainsCatalogService } from './chains-catalog.service.js';
import { ChainsController } from './chains.controller.js';

@Module({
  controllers: [ChainsController],
  providers: [ChainsCatalogService, { provide: CLOCK, useValue: systemClock }],
})
export class ChainsModule {}
