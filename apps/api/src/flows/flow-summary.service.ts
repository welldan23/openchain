import { Injectable } from '@nestjs/common';
import { SnapshotFreshness } from '../tokens/snapshot-freshness.js';
import { FlowLookupService, type FlowQuery } from './flow-lookup.service.js';
import { toFlowSummary } from './flow-summary.mapper.js';
import type { FlowSummaryResponse } from './flow-summary.types.js';
import { FlowsRepository } from './flows.repository.js';

/**
 * Ringkasan aliran masuk dan keluar satu address dari pemindaian yang sudah
 * tersimpan. Tidak menghubungi provider: hasilnya bisa direproduksi dengan
 * memilih pemindaian yang sama (`scan` atau `at`).
 */
@Injectable()
export class FlowSummaryService {
  constructor(
    private readonly lookup: FlowLookupService,
    private readonly repository: FlowsRepository,
    private readonly freshness: SnapshotFreshness,
  ) {}

  async getSummary(chainId: string, rawAddress: string, query: FlowQuery = {}): Promise<FlowSummaryResponse> {
    const { chain, address, scan, failedAttempt, window } = await this.lookup.resolve(chainId, rawAddress, query);
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
