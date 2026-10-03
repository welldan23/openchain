import { Injectable } from '@nestjs/common';
import type { ContractChecksResponse } from './contract-checks.types.js';
import { toContractChecksResponse } from './contract-checks.mapper.js';
import { SnapshotFreshness } from './snapshot-freshness.js';
import { TokenLookupService } from './token-lookup.service.js';
import { TokensRepository } from './tokens.repository.js';

@Injectable()
export class ContractChecksService {
  constructor(
    private readonly lookup: TokenLookupService,
    private readonly repository: TokensRepository,
    private readonly freshness: SnapshotFreshness,
  ) {}

  async getContractChecks(
    chainId: string,
    rawAddress: string,
    blockNumber?: number,
  ): Promise<ContractChecksResponse> {
    const resolved = await this.lookup.resolve(chainId, rawAddress, blockNumber);
    const checks = resolved.snapshot
      ? await this.repository.findContractChecks(resolved.snapshot.id)
      : [];
    const evidenceByCheck = await this.repository.findContractCheckEvidence(
      checks.map((check) => check.id),
    );
    return toContractChecksResponse(
      { ...resolved, checks, evidenceByCheck },
      this.freshness.now(),
      this.freshness.staleAfterMinutes,
    );
  }
}
