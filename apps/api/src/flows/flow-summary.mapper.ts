import { formatUnits, numericToNumber } from '../common/units.js';
import type { ChainFamily } from '../database/schema/enums.js';
import type { labels } from '../database/schema/index.js';
import { effectiveStatus } from '../tokens/token-summary.mapper.js';
import { sortLabels, toLabelView } from '../tokens/holders.mapper.js';
import type {
  FlowAsset,
  FlowAssetSummary,
  FlowSide,
  FlowSummaryResponse,
  FlowTotals,
} from './flow-summary.types.js';
import type { FlowAggregates, ScanRow, SideRow } from './flows.repository.js';

/** Desimal native coin per keluarga chain; `null` bila belum diketahui. */
type LabelRow = typeof labels.$inferSelect;

const NATIVE_DECIMALS: Partial<Record<ChainFamily, number>> = { evm: 18, solana: 9 };

export interface FlowSummaryRows {
  chain: {
    id: string;
    name: string;
    family: ChainFamily;
    nativeSymbol: string;
    explorerUrl: string | null;
    supportStatus: 'planned' | 'experimental' | 'validated';
  };
  address: string;
  labels: LabelRow[];
  scan: ScanRow | null;
  failedAttempt: ScanRow | null;
  window: { from: Date; to: Date; clipped: boolean } | null;
  aggregates: FlowAggregates | null;
}

function amountIn(raw: string, decimals: number | null): string | null {
  return decimals === null ? null : formatUnits(raw, decimals);
}

function signedAmount(raw: bigint, decimals: number | null): string | null {
  if (decimals === null) return null;
  const formatted = formatUnits((raw < 0n ? -raw : raw).toString(), decimals);
  return raw < 0n ? `-${formatted}` : formatted;
}

function emptySide(): FlowSide {
  return { transferCount: 0, amountRaw: '0', amount: '0', amountUsd: null, unpricedCount: 0 };
}

function toSide(row: SideRow | undefined, decimals: number | null): FlowSide {
  if (!row) return { ...emptySide(), amount: decimals === null ? null : '0' };
  return {
    transferCount: row.transferCount,
    amountRaw: row.amountRaw,
    amount: amountIn(row.amountRaw, decimals),
    amountUsd: row.pricedCount > 0 ? numericToNumber(row.amountUsd) : null,
    unpricedCount: row.transferCount - row.pricedCount,
  };
}

function toAsset(asset: FlowAsset, rows: SideRow[]): FlowAssetSummary {
  const decimals = asset.decimals;
  const inSide = toSide(rows.find((row) => row.direction === 'in'), decimals);
  const outSide = toSide(rows.find((row) => row.direction === 'out'), decimals);
  const net = BigInt(inSide.amountRaw) - BigInt(outSide.amountRaw);
  return { asset, in: inSide, out: outSide, netRaw: net.toString(), net: signedAmount(net, decimals) };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function totalsOf(assets: FlowAssetSummary[], aggregates: FlowAggregates): FlowTotals {
  const count = (pick: (asset: FlowAssetSummary) => number) => assets.reduce((sum, asset) => sum + pick(asset), 0);
  const inCount = count((asset) => asset.in.transferCount);
  const outCount = count((asset) => asset.out.transferCount);
  const inUnpriced = count((asset) => asset.in.unpricedCount);
  const outUnpriced = count((asset) => asset.out.unpricedCount);
  const usdSum = (side: 'in' | 'out') => {
    const priced = assets.filter((asset) => asset[side].amountUsd !== null);
    return priced.length === 0 ? null : round2(priced.reduce((sum, asset) => sum + (asset[side].amountUsd ?? 0), 0));
  };
  const inUsd = usdSum('in');
  const outUsd = usdSum('out');
  const unpricedCount = inUnpriced + outUnpriced;
  return {
    in: { transferCount: inCount, counterpartyCount: aggregates.counterparties.in },
    out: { transferCount: outCount, counterpartyCount: aggregates.counterparties.out },
    counterpartyCount: aggregates.counterparties.all,
    selfTransferCount: aggregates.selfTransferCount,
    usd: {
      inUsd,
      outUsd,
      // Selisih hanya bermakna bila semua transfer punya harga saat transaksi.
      netUsd: unpricedCount === 0 && (inCount > 0 || outCount > 0) ? round2((inUsd ?? 0) - (outUsd ?? 0)) : null,
      pricedCount: inCount + outCount - unpricedCount,
      unpricedCount,
      classification: 'derived_metric',
    },
  };
}

export function toFlowSummary(rows: FlowSummaryRows, now: Date, staleAfterMinutes: number): FlowSummaryResponse {
  const { chain, scan, aggregates } = rows;
  const nativeAsset: FlowAsset = { type: 'native', symbol: chain.nativeSymbol, decimals: NATIVE_DECIMALS[chain.family] ?? null };

  const assets: FlowAssetSummary[] = [];
  if (aggregates) {
    if (aggregates.native.length > 0) assets.push(toAsset(nativeAsset, aggregates.native));
    const byToken = new Map<number, typeof aggregates.tokens>();
    for (const row of aggregates.tokens) byToken.set(row.tokenId, [...(byToken.get(row.tokenId) ?? []), row]);
    const tokenAssets = [...byToken.values()].map((tokenRows) => {
      const [first] = tokenRows;
      return toAsset(
        { type: 'token', address: first.tokenAddress, symbol: first.symbol, name: first.name, decimals: first.decimals },
        tokenRows,
      );
    });
    tokenAssets.sort(
      (a, b) =>
        b.in.transferCount + b.out.transferCount - (a.in.transferCount + a.out.transferCount) ||
        String(a.asset.type === 'token' ? a.asset.symbol : '').localeCompare(String(b.asset.type === 'token' ? b.asset.symbol : '')),
    );
    assets.push(...tokenAssets);
  }

  const scanInfo = scan
    ? {
        id: scan.id,
        scannedAt: scan.scannedAt.toISOString(),
        blockFrom: scan.blockFrom,
        blockTo: scan.blockTo,
        windowFrom: scan.windowFrom.toISOString(),
        windowTo: scan.windowTo.toISOString(),
        coverage: { native: scan.nativeScanned, internal: scan.internalScanned, tokens: scan.tokensScanned },
        collectedStatus: scan.status,
        dataStatus: effectiveStatus(scan.status, scan.scannedAt, now, staleAfterMinutes),
        statusReason: scan.statusReason,
        missingFields: scan.missingFields,
      }
    : null;

  return {
    chain: {
      id: chain.id,
      name: chain.name,
      nativeSymbol: chain.nativeSymbol,
      explorerUrl: chain.explorerUrl,
      supportStatus: chain.supportStatus,
    },
    address: rows.address,
    labels: sortLabels(rows.labels).map(toLabelView),
    scan: scanInfo,
    lastFailedAttempt: rows.failedAttempt
      ? {
          scannedAt: rows.failedAttempt.scannedAt.toISOString(),
          status: rows.failedAttempt.status,
          statusReason: rows.failedAttempt.statusReason,
        }
      : null,
    window: rows.window
      ? { from: rows.window.from.toISOString(), to: rows.window.to.toISOString(), clipped: rows.window.clipped }
      : null,
    totals: aggregates ? totalsOf(assets, aggregates) : null,
    assets,
    dataStatus: scanInfo?.dataStatus ?? 'unavailable',
  };
}
