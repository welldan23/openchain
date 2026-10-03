import { Injectable } from '@nestjs/common';
import { SnapshotFreshness } from './snapshot-freshness.js';
import { TokenLookupService } from './token-lookup.service.js';
import { toTokenSummary } from './token-summary.mapper.js';
import type { TokenSummaryResponse } from './token-summary.types.js';
import { TokensRepository } from './tokens.repository.js';

@Injectable()
export class TokenSummaryService {
  constructor(
    private readonly lookup: TokenLookupService,
    private readonly repository: TokensRepository,
    private readonly freshness: SnapshotFreshness,
  ) {}

  async getSummary(chainId: string, rawAddress: string, blockNumber?: number): Promise<TokenSummaryResponse> {
    const resolved = await this.lookup.resolve(chainId, rawAddress, blockNumber);
    const sources = resolved.snapshot
      ? await this.repository.findSnapshotSources(resolved.snapshot.id)
      : [];
    return toTokenSummary(
      { ...resolved, sources },
      this.freshness.now(),
      this.freshness.staleAfterMinutes,
    );
  }
}
