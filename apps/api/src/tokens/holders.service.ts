import { Injectable } from '@nestjs/common';
import type { HoldersResponse } from './holders.types.js';
import { toHoldersResponse } from './holders.mapper.js';
import { SnapshotFreshness } from './snapshot-freshness.js';
import { TokenLookupService } from './token-lookup.service.js';
import { TokensRepository } from './tokens.repository.js';

export const DEFAULT_HOLDER_LIMIT = 10;
export const MAX_HOLDER_LIMIT = 100;

@Injectable()
export class HoldersService {
  constructor(
    private readonly lookup: TokenLookupService,
    private readonly repository: TokensRepository,
    private readonly freshness: SnapshotFreshness,
  ) {}

  async getHolders(
    chainId: string,
    rawAddress: string,
    options: { blockNumber?: number; limit?: number } = {},
  ): Promise<HoldersResponse> {
    const resolved = await this.lookup.resolve(chainId, rawAddress, options.blockNumber);
    const holders = resolved.snapshot
      ? await this.repository.findHolders(resolved.snapshot.id, options.limit ?? DEFAULT_HOLDER_LIMIT)
      : [];
    const labelsByAddress = await this.repository.findLabels(holders.map((holder) => holder.addressId));
    return toHoldersResponse(
      { ...resolved, holders, labelsByAddress },
      this.freshness.now(),
      this.freshness.staleAfterMinutes,
    );
  }
}
