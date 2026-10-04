import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { FlowsModule } from '../flows/flows.module.js';
import { CasesController } from './cases.controller.js';
import { CasesRepository } from './cases.repository.js';
import { CasesService } from './cases.service.js';

@Module({
  imports: [FlowsModule],
  controllers: [CasesController],
  providers: [CasesService, CasesRepository, { provide: CLOCK, useValue: systemClock }],
})
export class CasesModule {}
