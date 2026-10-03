import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { infoClassification, type InfoClassification } from '../database/schema/enums.js';
import { ContractChecksService } from './contract-checks.service.js';
import type { ContractChecksResponse } from './contract-checks.types.js';
import { EvidenceListService } from './evidence-list.service.js';
import type { EvidenceListResponse } from './evidence-list.types.js';
import { HoldersService, MAX_HOLDER_LIMIT } from './holders.service.js';
import type { HoldersResponse } from './holders.types.js';
import { TokenSummaryService } from './token-summary.service.js';
import type { TokenSummaryResponse } from './token-summary.types.js';
import type { SnapshotSelector } from './tokens.repository.js';

/**
 * Endpoint baca data token. Semua endpoint di sini read-only.
 *
 * Pemilih snapshot yang sama berlaku di semua endpoint, supaya investigasi
 * bisa dibuka ulang dengan hasil yang sama:
 * - `?block=<nomor>`: snapshot pada blok/slot tertentu.
 * - `?at=<waktu ISO>`: snapshot terakhir yang diambil sampai waktu itu.
 * - tanpa keduanya: snapshot terbaru.
 */
@Controller('tokens')
export class TokensController {
  constructor(
    private readonly summaryService: TokenSummaryService,
    private readonly contractChecksService: ContractChecksService,
    private readonly holdersService: HoldersService,
    private readonly evidenceListService: EvidenceListService,
  ) {}

  /** Ringkasan token untuk blok Ringkasan Token. */
  @Get(':chain/:address/summary')
  getSummary(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('block') block?: string,
    @Query('at') at?: string,
  ): Promise<TokenSummaryResponse> {
    return this.summaryService.getSummary(chain, address, parseSelector(block, at));
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
    @Query('at') at?: string,
  ): Promise<ContractChecksResponse> {
    return this.contractChecksService.getContractChecks(chain, address, parseSelector(block, at));
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
    @Query('at') at?: string,
    @Query('limit') limit?: string,
  ): Promise<HoldersResponse> {
    return this.holdersService.getHolders(chain, address, {
      selector: parseSelector(block, at),
      limit: parseLimit(limit),
    });
  }

  /**
   * Bukti transaksi yang mendukung temuan risiko dan cek kontrak pada
   * snapshot. `?finding=<kode>` hanya menampilkan bukti untuk satu temuan, dan
   * `?classification=` menyaring menurut jenis informasi.
   */
  @Get(':chain/:address/evidence')
  getEvidence(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('block') block?: string,
    @Query('at') at?: string,
    @Query('finding') finding?: string,
    @Query('classification') classification?: string,
  ): Promise<EvidenceListResponse> {
    return this.evidenceListService.getEvidence(
      chain,
      address,
      { finding: finding ? finding : null, classification: parseClassification(classification) },
      parseSelector(block, at),
    );
  }
}

function parseSelector(block: string | undefined, at: string | undefined): SnapshotSelector {
  const hasBlock = block !== undefined && block !== '';
  const hasAt = at !== undefined && at !== '';
  if (hasBlock && hasAt) {
    throw new BadRequestException('Pakai salah satu: parameter block atau at, bukan keduanya.');
  }
  if (hasBlock) {
    if (!/^\d+$/.test(block) || !Number.isSafeInteger(Number(block))) {
      throw new BadRequestException('Parameter block harus berupa nomor blok yang valid.');
    }
    return { blockNumber: Number(block) };
  }
  if (hasAt) {
    // Wajib ISO 8601 lengkap dengan zona waktu supaya tidak ambigu.
    const isIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(at);
    const date = new Date(at);
    if (!isIso || Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        'Parameter at harus waktu ISO 8601 dengan zona waktu, mis. 2026-10-03T04:30:00Z.',
      );
    }
    return { at: date };
  }
  return {};
}

function parseClassification(value: string | undefined): InfoClassification | null {
  if (value === undefined || value === '') return null;
  const allowed: readonly string[] = infoClassification.enumValues;
  if (!allowed.includes(value)) {
    throw new BadRequestException(`Parameter classification harus salah satu dari: ${allowed.join(', ')}.`);
  }
  return value as InfoClassification;
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const limit = Number(value);
  if (!/^\d+$/.test(value) || limit < 1 || limit > MAX_HOLDER_LIMIT) {
    throw new BadRequestException(`Parameter limit harus angka 1 sampai ${MAX_HOLDER_LIMIT}.`);
  }
  return limit;
}
