import { Controller, Get, Param, Query } from '@nestjs/common';
import { parseIsoTime, parsePositiveInteger } from '../common/query-params.js';
import { FlowSummaryService } from './flow-summary.service.js';
import type { FlowSummaryResponse } from './flow-summary.types.js';

/**
 * Endpoint baca aliran dana. Semua read-only dan hanya membaca hasil
 * pemindaian yang tersimpan (`npm run flows:collect`).
 *
 * Pemilih pemindaian supaya hasil bisa direproduksi:
 * - `?scan=<id>`: pemindaian tertentu.
 * - `?at=<waktu ISO>`: pemindaian terakhir sampai waktu itu.
 * - tanpa keduanya: pemindaian terbaru yang berhasil.
 * `?from=` dan `?to=` (ISO) mempersempit rentang waktu di dalam cakupan.
 */
@Controller('flows')
export class FlowsController {
  constructor(private readonly summaryService: FlowSummaryService) {}

  /** Ringkasan aliran masuk dan keluar per aset, lawan transaksi, dan cakupan data. */
  @Get(':chain/:address/summary')
  getSummary(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('scan') scan?: string,
    @Query('at') at?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<FlowSummaryResponse> {
    return this.summaryService.getSummary(chain, address, {
      scanId: parsePositiveInteger(scan, 'scan'),
      at: parseIsoTime(at, 'at'),
      from: parseIsoTime(from, 'from'),
      to: parseIsoTime(to, 'to'),
    });
  }
}
