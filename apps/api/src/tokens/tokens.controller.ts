import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { HoldersService, MAX_HOLDER_LIMIT } from './holders.service.js';
import type { HoldersResponse } from './holders.types.js';
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
    private readonly holdersService: HoldersService,
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

  /**
   * Sebaran pemegang: konsentrasi supply dan holder teratas beserta label
   * entitas dan sumbernya. `?limit=` mengatur jumlah holder (default 10).
   */
  @Get(':chain/:address/holders')
  getHolders(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('block') block?: string,
    @Query('limit') limit?: string,
  ): Promise<HoldersResponse> {
    return this.holdersService.getHolders(chain, address, {
      blockNumber: parseBlock(block),
      limit: parseLimit(limit),
    });
  }
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const limit = Number(value);
  if (!/^\d+$/.test(value) || limit < 1 || limit > MAX_HOLDER_LIMIT) {
    throw new BadRequestException(`Parameter limit harus angka 1 sampai ${MAX_HOLDER_LIMIT}.`);
  }
  return limit;
}

function parseBlock(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new BadRequestException('Parameter block harus berupa nomor blok yang valid.');
  }
  return Number(value);
}
