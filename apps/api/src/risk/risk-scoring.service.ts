/**
 * Skoring risiko objek multichain: satu address bisa berupa token di satu
 * chain dan wallet di chain lain, jadi setiap chain tempat address itu
 * tercatat dinilai sendiri. Hanya dari data tersimpan; chain tanpa data yang
 * bisa dinilai dilaporkan apa adanya, tidak diberi skor tebakan.
 */
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { InvalidIdentifierError, normalizeAddress } from '../database/identifiers.js';
import type { ChainFamily, DataStatus, RiskObjectKind } from '../database/schema/enums.js';
import { RISK_METHODOLOGY, scoreContract, scoreToken, scoreWallet, type AssessmentDraft } from './risk-rules.js';
import { RiskRepository, type DataPoint, type RiskObjectRow } from './risk.repository.js';

export class RiskScoringError extends Error {
  constructor(
    readonly code: 'chain_not_found' | 'invalid_address' | 'address_not_found',
    message: string,
  ) {
    super(message);
  }
}

export type ChainAssessmentResult =
  | {
      status: 'assessed';
      chainId: string;
      address: string;
      objectKind: RiskObjectKind;
      assessmentId: number;
      blockNumber: number;
      fetchedAt: Date;
      dataStatus: DataStatus;
      statusReason: string | null;
      draft: AssessmentDraft;
    }
  | { status: 'no_data'; chainId: string; address: string; objectKind: RiskObjectKind; reason: string };

export function objectKindOf(row: Pick<RiskObjectRow, 'tokenId' | 'isContract' | 'hasContractLabel'>): RiskObjectKind {
  if (row.tokenId !== null) return 'token';
  return row.isContract === true || row.hasContractLabel ? 'contract' : 'wallet';
}

/** Status data penilaian: penilaian tanpa skor tidak pernah tercatat "lengkap". */
export function assessmentStatus(data: Pick<DataPoint, 'dataStatus' | 'statusReason'>, draft: Pick<AssessmentDraft, 'unratedReason'>): { dataStatus: DataStatus; statusReason: string | null } {
  const reasons = [data.statusReason, draft.unratedReason].filter((item): item is string => Boolean(item));
  const dataStatus: DataStatus = draft.unratedReason && data.dataStatus === 'complete' ? 'partial' : data.dataStatus;
  if (dataStatus === 'complete') return { dataStatus, statusReason: null };
  return { dataStatus, statusReason: reasons.length > 0 ? reasons.join(' ') : 'Sebagian data tidak lengkap; alasannya tidak tercatat.' };
}

@Injectable()
export class RiskScoringService {
  constructor(
    private readonly repository: RiskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Nilai address di satu chain, atau di semua chain satu keluarga tempat
   * address itu tercatat bila chain tidak disebut.
   */
  async assessAddress(rawAddress: string, chainId?: string): Promise<ChainAssessmentResult[]> {
    const chains = await this.repository.chains();
    let family: ChainFamily;
    let chainIds: string[];
    if (chainId) {
      const chain = chains.find((item) => item.id === chainId);
      if (!chain) throw new RiskScoringError('chain_not_found', `Chain "${chainId}" tidak dikenal.`);
      family = chain.family;
      chainIds = [chain.id];
    } else {
      family = /^0x[0-9a-fA-F]{40}$/.test(rawAddress.trim()) ? 'evm' : 'solana';
      chainIds = chains.filter((item) => item.family === family).map((item) => item.id);
    }
    let normalized: string;
    try {
      normalized = normalizeAddress(family, rawAddress);
    } catch (error) {
      if (error instanceof InvalidIdentifierError) throw new RiskScoringError('invalid_address', `Address tidak valid untuk chain ${family === 'evm' ? 'EVM' : 'Solana'}.`);
      throw error;
    }
    const objects = await this.repository.objects(chainIds, normalized);
    if (objects.length === 0) throw new RiskScoringError('address_not_found', `Address ${rawAddress.trim()} belum pernah tercatat di data tersimpan.`);
    const results: ChainAssessmentResult[] = [];
    for (const object of objects) results.push(await this.assessObject(object));
    return results;
  }

  private async assessObject(object: RiskObjectRow): Promise<ChainAssessmentResult> {
    const objectKind = objectKindOf(object);
    const base = { chainId: object.chainId, address: object.address, objectKind };

    let data: DataPoint | null;
    let draft: AssessmentDraft;
    let tokenSnapshotId: number | null = null;
    if (objectKind === 'token') {
      const snapshot = await this.repository.latestTokenSnapshot(object.tokenId!);
      if (!snapshot) return { ...base, status: 'no_data', reason: 'Token ini belum punya snapshot. Ambil datanya dulu sebelum dinilai.' };
      const [checks, clusters] = await Promise.all([this.repository.contractChecks(snapshot.snapshotId), this.repository.tokenClusters(object.tokenId!)]);
      draft = scoreToken({ checks, top10Pct: snapshot.top10Pct, clusters });
      data = snapshot;
      tokenSnapshotId = snapshot.snapshotId;
    } else {
      data = await this.repository.latestFlowScan(object.chainId, object.addressId);
      if (!data) {
        return {
          ...base,
          status: 'no_data',
          reason: objectKind === 'wallet' ? 'Riwayat address ini belum dipindai di chain ini.' : 'Belum ada data tersimpan untuk kontrak ini di chain ini.',
        };
      }
      if (objectKind === 'wallet') {
        const [movements, fundedClusters, botLabels] = await Promise.all([
          this.repository.walletMovements(object.chainId, object.addressId, data.blockNumber),
          this.repository.fundedClusters(object.chainId, object.addressId),
          this.repository.botLabels(object.addressId),
        ]);
        draft = scoreWallet({ movements, fundedClusters, botLabels }, data.fetchedAt);
      } else {
        draft = scoreContract();
      }
    }

    const status = assessmentStatus(data, draft);
    const assessmentId = await this.repository.save({
      chainId: object.chainId,
      addressId: object.addressId,
      objectKind,
      tokenSnapshotId,
      methodology: RISK_METHODOLOGY,
      draft,
      data,
      ...status,
      assessedAt: this.clock.now(),
    });
    return { ...base, status: 'assessed', assessmentId, blockNumber: data.blockNumber, fetchedAt: data.fetchedAt, draft, ...status };
  }
}
