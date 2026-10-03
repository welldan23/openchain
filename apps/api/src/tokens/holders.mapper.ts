import { formatUnits, numericToNumber } from '../common/units.js';
import type { labels } from '../database/schema/index.js';
import type { HolderLabelView, HoldersResponse } from './holders.types.js';
import type { ResolvedToken } from './token-lookup.service.js';
import { toSnapshotHeader } from './token-summary.mapper.js';

type LabelRow = typeof labels.$inferSelect;

export interface HolderRow {
  rank: number;
  addressId: number;
  address: string;
  balanceRaw: string;
  sharePct: string;
}

export interface HoldersRows extends ResolvedToken {
  holders: HolderRow[];
  labelsByAddress: Map<number, LabelRow[]>;
}

const SOURCE_ORDER: Record<LabelRow['source'], number> = { external: 0, heuristic: 1, user: 2 };

/** Label eksternal dulu, lalu heuristic, lalu user; confidence tinggi lebih dulu. */
export function sortLabels(rows: LabelRow[]): LabelRow[] {
  return [...rows].sort((a, b) => {
    const bySource = SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
    if (bySource !== 0) return bySource;
    const confidenceA = numericToNumber(a.confidence) ?? -1;
    const confidenceB = numericToNumber(b.confidence) ?? -1;
    return confidenceB - confidenceA || a.id - b.id;
  });
}

function toLabelView(row: LabelRow): HolderLabelView {
  return {
    type: row.labelType,
    name: row.name,
    source: row.source,
    sourceName: row.sourceName,
    classification: row.classification,
    confidence: numericToNumber(row.confidence),
  };
}

export function toHoldersResponse(rows: HoldersRows, now: Date, staleAfterMinutes: number): HoldersResponse {
  const { chain, token, snapshot } = rows;
  const header = snapshot ? toSnapshotHeader(snapshot, now, staleAfterMinutes) : null;

  return {
    chain: { id: chain.id, name: chain.name, supportStatus: chain.supportStatus },
    token: { address: rows.address, symbol: token.symbol, decimals: token.decimals },
    snapshot: header,
    dataStatus: header?.dataStatus ?? 'unavailable',
    holderCount: snapshot?.holderCount ?? null,
    concentration: snapshot
      ? {
          top10Pct: numericToNumber(snapshot.top10Pct),
          top50Pct: numericToNumber(snapshot.top50Pct),
          classification: 'derived_metric',
        }
      : null,
    holders: rows.holders.map((holder) => ({
      rank: holder.rank,
      address: holder.address,
      balanceRaw: holder.balanceRaw,
      balance: token.decimals === null ? null : formatUnits(holder.balanceRaw, token.decimals),
      sharePct: numericToNumber(holder.sharePct) ?? 0,
      labels: sortLabels(rows.labelsByAddress.get(holder.addressId) ?? []).map(toLabelView),
    })),
  };
}
