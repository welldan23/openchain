import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { parseIsoTime, parsePositiveInteger } from '../common/query-params.js';
import { FLOW_RANGE_PRESETS, type FlowRangePreset, type FlowRangeRequest } from './flow-range.js';
import { FlowChainsService } from './flow-chains.service.js';
import type { FlowChainsResponse } from './flow-chains.types.js';
import { FlowSummaryService } from './flow-summary.service.js';
import { FlowTransfersService, MAX_TRANSFER_LIMIT } from './flow-transfers.service.js';
import type { FlowTransfersResponse } from './flow-transfers.types.js';
import type { FlowSummaryResponse } from './flow-summary.types.js';

/**
 * Endpoint baca aliran dana. Semua read-only dan hanya membaca hasil
 * pemindaian yang tersimpan (`npm run flows:collect`).
 *
 * Pemilih pemindaian supaya hasil bisa direproduksi:
 * - `?scan=<id>`: pemindaian tertentu.
 * - `?at=<waktu ISO>`: pemindaian terakhir sampai waktu itu.
 * - tanpa keduanya: pemindaian terbaru yang berhasil.
 * Rentang waktu, selalu dipotong ke cakupan: `?range=24h|7d|30d|all` (dihitung
 * mundur dari akhir cakupan), atau `?from=` / `?to=` (ISO), tidak keduanya.
 */
@Controller('flows')
export class FlowsController {
  constructor(
    private readonly summaryService: FlowSummaryService,
    private readonly transfersService: FlowTransfersService,
    private readonly chainsService: FlowChainsService,
  ) {}

  /**
   * Status aliran dana address ini di setiap chain yang format address-nya
   * cocok. `?chains=ethereum,base` membatasi ke chain tertentu.
   */
  @Get(':address/chains')
  getChains(@Param('address') address: string, @Query('chains') chains?: string): Promise<FlowChainsResponse> {
    const requested = chains === undefined || chains === '' ? undefined : [...new Set(chains.split(',').map((id) => id.trim()).filter(Boolean))];
    return this.chainsService.getChains(address, requested);
  }

  /** Ringkasan aliran masuk dan keluar per aset, lawan transaksi, dan cakupan data. */
  @Get(':chain/:address/summary')
  getSummary(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('scan') scan?: string,
    @Query('at') at?: string,
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<FlowSummaryResponse> {
    return this.summaryService.getSummary(chain, address, {
      scanId: parsePositiveInteger(scan, 'scan'),
      at: parseIsoTime(at, 'at'),
      ...parseRange(range, from, to),
    });
  }

  /**
   * Transfer satu address dalam rentang, terbaru dulu. `?direction=in|out`
   * menyaring arah, `?limit=` (1–200, default 50) mengatur jumlah per halaman,
   * dan `?cursor=` mengambil halaman berikutnya dari `nextCursor`.
   */
  @Get(':chain/:address/transfers')
  getTransfers(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('scan') scan?: string,
    @Query('at') at?: string,
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('direction') direction?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<FlowTransfersResponse> {
    if (direction !== undefined && direction !== '' && direction !== 'in' && direction !== 'out') {
      throw new BadRequestException('Parameter direction harus in atau out.');
    }
    const parsedLimit = parsePositiveInteger(limit, 'limit');
    if (parsedLimit !== undefined && parsedLimit > MAX_TRANSFER_LIMIT) {
      throw new BadRequestException(`Parameter limit harus angka 1 sampai ${MAX_TRANSFER_LIMIT}.`);
    }
    return this.transfersService.getTransfers(chain, address, {
      scanId: parsePositiveInteger(scan, 'scan'),
      at: parseIsoTime(at, 'at'),
      ...parseRange(range, from, to),
      direction: direction ? direction : undefined,
      limit: parsedLimit,
      cursor: cursor ? cursor : undefined,
    });
  }
}

const PRESETS = Object.keys(FLOW_RANGE_PRESETS) as FlowRangePreset[];

/** `range` (preset) atau `from`/`to` (ISO), tidak keduanya. */
export function parseRange(range: string | undefined, from: string | undefined, to: string | undefined): FlowRangeRequest {
  const parsedFrom = parseIsoTime(from, 'from');
  const parsedTo = parseIsoTime(to, 'to');
  if (parsedFrom && parsedTo && parsedFrom > parsedTo) {
    throw new BadRequestException('Parameter from harus sebelum atau sama dengan to.');
  }
  if (range === undefined || range === '') return { from: parsedFrom, to: parsedTo };
  if (parsedFrom || parsedTo) throw new BadRequestException('Pakai salah satu: parameter range, atau from/to.');
  if (!PRESETS.includes(range as FlowRangePreset)) {
    throw new BadRequestException(`Parameter range harus salah satu dari: ${PRESETS.join(', ')}.`);
  }
  return { preset: range as FlowRangePreset };
}
