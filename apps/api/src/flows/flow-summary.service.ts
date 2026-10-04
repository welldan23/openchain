import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvalidIdentifierError, normalizeAddress } from '../database/identifiers.js';
import { SnapshotFreshness } from '../tokens/snapshot-freshness.js';
import { toFlowSummary } from './flow-summary.mapper.js';
import type { FlowSummaryResponse } from './flow-summary.types.js';
import { FlowsRepository, type ScanSelector } from './flows.repository.js';

export interface FlowSummaryQuery extends ScanSelector {
  /** Batas waktu yang diminta; dipotong ke cakupan pemindaian. */
  from?: Date;
  to?: Date;
}

/**
 * Ringkasan aliran masuk dan keluar satu address dari pemindaian yang sudah
 * tersimpan. Tidak menghubungi provider: hasilnya bisa direproduksi dengan
 * memilih pemindaian yang sama (`scan` atau `at`).
 */
@Injectable()
export class FlowSummaryService {
  constructor(
    private readonly repository: FlowsRepository,
    private readonly freshness: SnapshotFreshness,
  ) {}

  async getSummary(chainId: string, rawAddress: string, query: FlowSummaryQuery = {}): Promise<FlowSummaryResponse> {
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('Parameter from harus sebelum atau sama dengan to.');
    }
    const chain = await this.repository.findChain(chainId);
    if (!chain) throw new NotFoundException(`Chain "${chainId}" tidak dikenal.`);

    let normalized: string;
    try {
      normalized = normalizeAddress(chain.family, rawAddress);
    } catch (error) {
      if (error instanceof InvalidIdentifierError) throw new BadRequestException(error.message);
      throw error;
    }
    const address = await this.repository.findAddress(chain.id, normalized);
    if (!address) {
      throw new NotFoundException(`Address ${rawAddress.trim()} belum pernah dipindai di ${chain.name}.`);
    }

    const scan = await this.repository.findScan(chain.id, address.id, query);
    if (query.scanId !== undefined && !scan) {
      throw new NotFoundException(`Pemindaian #${query.scanId} untuk address ini tidak ditemukan${query.at ? ' sampai waktu itu' : ''}.`);
    }
    const failedAttempt = await this.repository.findFailedAttemptAfter(chain.id, address.id, scan?.scannedAt ?? null, query.at);

    // Irisan rentang yang diminta dengan cakupan pemindaian.
    let window: { from: Date; to: Date; clipped: boolean } | null = null;
    if (scan) {
      const from = query.from && query.from > scan.windowFrom ? query.from : scan.windowFrom;
      const to = query.to && query.to < scan.windowTo ? query.to : scan.windowTo;
      const clipped = (query.from !== undefined && query.from < scan.windowFrom) || (query.to !== undefined && query.to > scan.windowTo);
      if (from <= to) window = { from, to, clipped };
    }
    const aggregates =
      scan && window
        ? await this.repository.aggregate(chain.id, address.id, {
            blockFrom: scan.blockFrom,
            blockTo: scan.blockTo,
            from: window.from,
            to: window.to,
          })
        : null;

    return toFlowSummary(
      {
        chain,
        address: address.address,
        labels: await this.repository.findLabels(address.id),
        scan,
        failedAttempt,
        window,
        aggregates,
      },
      this.freshness.now(),
      this.freshness.staleAfterMinutes,
    );
  }
}
