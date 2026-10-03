import { Injectable, NotFoundException } from '@nestjs/common';
import type { EvidenceFilter, EvidenceListResponse } from './evidence-list.types.js';
import { toEvidenceListResponse } from './evidence-list.mapper.js';
import { SnapshotFreshness } from './snapshot-freshness.js';
import { TokenLookupService } from './token-lookup.service.js';
import { type SnapshotSelector, TokensRepository } from './tokens.repository.js';

@Injectable()
export class EvidenceListService {
  constructor(
    private readonly lookup: TokenLookupService,
    private readonly repository: TokensRepository,
    private readonly freshness: SnapshotFreshness,
  ) {}

  async getEvidence(
    chainId: string,
    rawAddress: string,
    filter: EvidenceFilter,
    selector: SnapshotSelector = {},
  ): Promise<EvidenceListResponse> {
    const resolved = await this.lookup.resolve(chainId, rawAddress, selector);
    const snapshotId = resolved.snapshot?.id;
    const findings = snapshotId ? await this.repository.findRiskFindings(snapshotId) : [];

    if (filter.finding && !findings.some((finding) => finding.code === filter.finding)) {
      throw new NotFoundException(`Temuan "${filter.finding}" tidak ada di snapshot ini.`);
    }

    const checks = snapshotId ? await this.repository.findContractChecks(snapshotId) : [];
    const findingLinks = await this.repository.findFindingEvidenceLinks(findings.map((f) => f.id));
    const checkLinks = await this.repository.findCheckEvidenceLinks(checks.map((c) => c.id));
    const records = await this.repository.findEvidenceRecords([
      ...findingLinks.map((link) => link.evidenceId),
      ...checkLinks.map((link) => link.evidenceId),
    ]);

    return toEvidenceListResponse(
      { ...resolved, findings, checks, findingLinks, checkLinks, records },
      filter,
      this.freshness.now(),
      this.freshness.staleAfterMinutes,
    );
  }
}
