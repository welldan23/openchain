import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { RiskSummaryService } from './risk-summary.service.js';
import type { MultichainRiskResponse, RiskSummaryView } from './risk.types.js';

function parseRefresh(value: string | undefined): boolean {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new BadRequestException('Parameter refresh harus true atau false.');
}

/**
 * Ringkasan skor risiko objek. `GET /risk/:chain/:address` satu chain,
 * `GET /risk/:address` semua chain satu keluarga tempat address tercatat.
 * Objek yang belum pernah dinilai langsung dinilai dari data tersimpan;
 * `?refresh=true` menilai ulang. Tidak menghubungi provider.
 */
@Controller('risk')
export class RiskController {
  constructor(private readonly service: RiskSummaryService) {}

  @Get(':chain/:address')
  summary(@Param('chain') chain: string, @Param('address') address: string, @Query('refresh') refresh?: string): Promise<RiskSummaryView> {
    return this.service.summary(chain, address, parseRefresh(refresh));
  }

  @Get(':address')
  multichain(@Param('address') address: string, @Query('refresh') refresh?: string): Promise<MultichainRiskResponse> {
    return this.service.multichain(address, parseRefresh(refresh));
  }
}
