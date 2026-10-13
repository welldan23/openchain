/**
 * Deteksi peringatan dini dari data tersimpan: snapshot token terbaru
 * dibandingkan snapshot sebelumnya, dan kiriman wallet ke wallet baru.
 * Dipakai setiap kali objek dinilai; tidak menghubungi provider.
 */
import { Injectable } from '@nestjs/common';
import type { CheckFact } from './risk-rules.js';
import { detectTokenWarnings, detectWalletWarnings, type TokenPoint, type WarningDetection } from './risk-warnings.js';
import { RiskRepository, type DataPoint, type TokenSnapshotPoint } from './risk.repository.js';

const point = (snapshot: TokenSnapshotPoint, checks: CheckFact[]): TokenPoint => ({
  blockNumber: snapshot.blockNumber,
  fetchedAt: snapshot.fetchedAt,
  top10Pct: snapshot.top10Pct,
  liquidityUsd: snapshot.liquidityUsd,
  priceUsd: snapshot.priceUsd,
  checks,
});

@Injectable()
export class RiskWarningService {
  constructor(private readonly repository: RiskRepository) {}

  /** Bandingkan snapshot token ini dengan snapshot sebelumnya. */
  async forToken(tokenId: number, current: TokenSnapshotPoint, checks: CheckFact[]): Promise<WarningDetection> {
    const previous = await this.repository.latestTokenSnapshot(tokenId, current.blockNumber);
    const previousChecks = previous ? await this.repository.contractChecks(previous.snapshotId) : [];
    return detectTokenWarnings(point(current, checks), previous ? point(previous, previousChecks) : null);
  }

  /** Kiriman wallet ke wallet baru sampai blok pemindaian terbaru. */
  async forWallet(chainId: string, addressId: number, data: DataPoint): Promise<WarningDetection> {
    return detectWalletWarnings(await this.repository.walletFundings(chainId, addressId, data.blockNumber), data.fetchedAt);
  }
}
