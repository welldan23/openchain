import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { infoClassification, riskSeverity, type InfoClassification, type RiskSeverity } from '../database/schema/enums.js';
import { RiskFindingDetailService } from './risk-finding-detail.service.js';
import { RiskFindingsService } from './risk-findings.service.js';
import { RiskSummaryService } from './risk-summary.service.js';
import type { MultichainRiskResponse, RiskFindingDetailResponse, RiskFindingsResponse, RiskSummaryView } from './risk.types.js';

function parseRefresh(value: string | undefined): boolean {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new BadRequestException('Parameter refresh harus true atau false.');
}

/** Daftar dipisah koma; nilai yang tidak dikenal ditolak supaya saringan tidak diam-diam kosong. */
function parseList<T extends string>(value: string | undefined, allowed: readonly T[], name: string): T[] {
  const items = [...new Set((value ?? '').split(',').map((item) => item.trim()).filter((item) => item !== ''))];
  const unknown = items.filter((item) => !(allowed as readonly string[]).includes(item));
  if (unknown.length > 0) throw new BadRequestException(`Parameter ${name} tidak dikenal: ${unknown.join(', ')}. Pilihan: ${allowed.join(', ')}.`);
  return items as T[];
}

/**
 * Ringkasan skor risiko objek. `GET /risk/:chain/:address` satu chain,
 * `GET /risk/:address` semua chain satu keluarga tempat address tercatat.
 * Objek yang belum pernah dinilai langsung dinilai dari data tersimpan;
 * `?refresh=true` menilai ulang. `findings` memberi semua temuan dengan jenis
 * informasi dan bukti hash, bisa disaring `?classification=` dan `?severity=`.
 * `reasons/:code` dan `warnings/:code` merinci satu temuan beserta isi
 * transaksi setiap hash buktinya. Tidak menghubungi provider.
 */
@Controller('risk')
export class RiskController {
  constructor(
    private readonly service: RiskSummaryService,
    private readonly findingsService: RiskFindingsService,
    private readonly detailService: RiskFindingDetailService,
  ) {}

  @Get(':chain/:address/reasons/:code')
  reason(@Param('chain') chain: string, @Param('address') address: string, @Param('code') code: string, @Query('refresh') refresh?: string): Promise<RiskFindingDetailResponse> {
    return this.detailService.detail(chain, address, 'reason', code, parseRefresh(refresh));
  }

  @Get(':chain/:address/warnings/:code')
  warning(@Param('chain') chain: string, @Param('address') address: string, @Param('code') code: string, @Query('refresh') refresh?: string): Promise<RiskFindingDetailResponse> {
    return this.detailService.detail(chain, address, 'warning', code, parseRefresh(refresh));
  }

  @Get(':chain/:address/findings')
  findings(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('classification') classification?: string,
    @Query('severity') severity?: string,
    @Query('refresh') refresh?: string,
  ): Promise<RiskFindingsResponse> {
    const filters = {
      classification: parseList<InfoClassification>(classification, infoClassification.enumValues, 'classification'),
      severity: parseList<RiskSeverity>(severity, riskSeverity.enumValues, 'severity'),
    };
    return this.findingsService.findings(chain, address, filters, parseRefresh(refresh));
  }

  @Get(':chain/:address')
  summary(@Param('chain') chain: string, @Param('address') address: string, @Query('refresh') refresh?: string): Promise<RiskSummaryView> {
    return this.service.summary(chain, address, parseRefresh(refresh));
  }

  @Get(':address')
  multichain(@Param('address') address: string, @Query('refresh') refresh?: string): Promise<MultichainRiskResponse> {
    return this.service.multichain(address, parseRefresh(refresh));
  }
}
