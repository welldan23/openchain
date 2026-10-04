import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { FlowsModule } from '../flows/flows.module.js';
import { SearchController } from './search.controller.js';
import { SearchRepository } from './search.repository.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [FlowsModule],
  controllers: [SearchController],
  providers: [SearchRepository, SearchService, { provide: CLOCK, useValue: systemClock }],
  exports: [SearchService],
})
export class SearchModule {}
