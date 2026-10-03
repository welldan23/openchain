import type { DataStatus } from '../database/schema/enums.js';
import { formatUnits, numericToNumber } from '../common/units.js';
import type { ChainRow, ProviderRunRow, SnapshotRow, TokenRow } from './rows.js';
import type { ProviderSource, SnapshotHeader, SnapshotInfo, TokenSummaryResponse } from './token-summary.types.js';

export interface TokenSummaryRows {
  chain: ChainRow;
  token: TokenRow;
  address: string;
  deployer: string | null;
  snapshot: SnapshotRow | null;
  sources: ProviderRunRow[];
}

/**
 * Status efektif snapshot. Data `complete`/`partial` yang lebih tua dari batas
 * dianggap `stale`; `unavailable` tetap `unavailable`.
 */
export function effectiveStatus(
  collected: DataStatus,
  fetchedAt: Date,
  now: Date,
  staleAfterMinutes: number,
): DataStatus {
  if (collected === 'unavailable' || collected === 'stale') return collected;
  const ageMs = now.getTime() - fetchedAt.getTime();
  return ageMs > staleAfterMinutes * 60_000 ? 'stale' : collected;
}

function toSource(run: ProviderRunRow): ProviderSource {
  return {
    provider: run.provider,
    kind: run.kind,
    operation: run.operation,
    status: run.status,
    fetchedAt: run.fetchedAt?.toISOString() ?? null,
    errorReason: run.errorReason,
    missingFields: run.missingFields,
  };
}

/** Kepala snapshot (blok, waktu, status) yang dipakai semua endpoint token. */
export function toSnapshotHeader(
  snapshot: SnapshotRow,
  now: Date,
  staleAfterMinutes: number,
): SnapshotHeader {
  return {
    blockNumber: snapshot.blockNumber,
    fetchedAt: snapshot.fetchedAt.toISOString(),
    collectedStatus: snapshot.dataStatus,
    dataStatus: effectiveStatus(snapshot.dataStatus, snapshot.fetchedAt, now, staleAfterMinutes),
  };
}

function toSnapshot(
  snapshot: SnapshotRow,
  sources: ProviderRunRow[],
  now: Date,
  staleAfterMinutes: number,
): SnapshotInfo {
  return { ...toSnapshotHeader(snapshot, now, staleAfterMinutes), sources: sources.map(toSource) };
}

export function toTokenSummary(
  rows: TokenSummaryRows,
  now: Date,
  staleAfterMinutes: number,
): TokenSummaryResponse {
  const { chain, token, snapshot } = rows;
  const snapshotInfo = snapshot ? toSnapshot(snapshot, rows.sources, now, staleAfterMinutes) : null;

  return {
    chain: {
      id: chain.id,
      name: chain.name,
      family: chain.family,
      nativeSymbol: chain.nativeSymbol,
      explorerUrl: chain.explorerUrl,
      supportStatus: chain.supportStatus,
    },
    token: {
      address: rows.address,
      standard: token.standard,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      totalSupplyRaw: token.totalSupplyRaw,
      totalSupply:
        token.totalSupplyRaw !== null && token.decimals !== null
          ? formatUnits(token.totalSupplyRaw, token.decimals)
          : null,
      deployer: rows.deployer,
      deployedAt: token.deployedAt?.toISOString() ?? null,
      deployTxHash: token.deployTxHash,
      sourceVerified: token.sourceVerified,
    },
    snapshot: snapshotInfo,
    dataStatus: snapshotInfo?.dataStatus ?? 'unavailable',
    market: snapshot
      ? {
          priceUsd: numericToNumber(snapshot.priceUsd),
          priceChange24hPct: numericToNumber(snapshot.priceChange24hPct),
          marketCapUsd: numericToNumber(snapshot.marketCapUsd),
          fdvUsd: numericToNumber(snapshot.fdvUsd),
          liquidityUsd: numericToNumber(snapshot.liquidityUsd),
          volume24hUsd: numericToNumber(snapshot.volume24hUsd),
          holderCount: snapshot.holderCount,
          txCount24h: snapshot.txCount24h,
        }
      : null,
    concentration: snapshot
      ? {
          top10Pct: numericToNumber(snapshot.top10Pct),
          top50Pct: numericToNumber(snapshot.top50Pct),
        }
      : null,
    risk: {
      score: snapshot?.riskScore ?? null,
      level: snapshot?.riskLevel ?? 'unknown',
    },
  };
}
