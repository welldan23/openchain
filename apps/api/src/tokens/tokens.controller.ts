import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { ContractChecksService } from './contract-checks.service.js';
import type { ContractChecksResponse } from './contract-checks.types.js';
import { TokenSummaryService } from './token-summary.service.js';
import type { TokenSummaryResponse } from './token-summary.types.js';

/** Endpoint baca data token. Semua endpoint di sini read-only. */
@Controller('tokens')
export class TokensController {
  constructor(
    private readonly summaryService: TokenSummaryService,
    private readonly contractChecksService: ContractChecksService,
  ) {}

  /**
   * Ringkasan token untuk blok Ringkasan Token.
   * `?block=` membuka snapshot pada blok tertentu supaya investigasi bisa
   * direproduksi; tanpa itu dipakai snapshot terbaru.
   */
  @Get(':chain/:address/summary')
  getSummary(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('block') block?: string,
  ): Promise<TokenSummaryResponse> {
    return this.summaryService.getSummary(chain, address, parseBlock(block));
  }

  /**
   * Hasil cek kontrak: izin dan fungsi yang bisa merugikan holder, urut dari
   * yang paling bermasalah, beserta bukti tiap pemeriksaan.
   */
  @Get(':chain/:address/contract-checks')
  getContractChecks(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('block') block?: string,
  ): Promise<ContractChecksResponse> {
    return this.contractChecksService.getContractChecks(chain, address, parseBlock(block));
  }
}

function parseBlock(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new BadRequestException('Parameter block harus berupa nomor blok yang valid.');
  }
  return Number(value);
}
