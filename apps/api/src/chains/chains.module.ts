import { Module } from '@nestjs/common';
import { ChainsCatalogService } from './chains-catalog.service.js';
import { ChainsController } from './chains.controller.js';

@Module({
  controllers: [ChainsController],
  providers: [ChainsCatalogService],
})
export class ChainsModule {}
