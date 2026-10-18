import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CLOCK, systemClock } from '../common/clock.js';
import { InvestigationsController } from './investigations.controller.js';
import { InvestigationsService } from './investigations.service.js';

@Module({
  imports: [AuthModule],
  controllers: [InvestigationsController],
  providers: [InvestigationsService, { provide: CLOCK, useValue: systemClock }],
  exports: [InvestigationsService],
})
export class InvestigationsModule {}
