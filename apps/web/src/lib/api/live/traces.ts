/**
 * Telusur jalur dana antar wallet dari API (`/api/traces`). Jalur dihitung
 * saat diminta dari transfer yang sudah tersimpan; batasan pencariannya
 * (address belum dipindai, pencarian terpotong) ditulis di status data.
 */
import type { CaseDataStatus, ChainId, WalletTrace } from "../../types";
import { apiJsonOrNull, seg } from "../http";
import { toEntityLabel, toNumber, type ApiLabel } from "./common";
import { toFlowAsset, type ApiFlowAsset } from "./flows";

interface ApiTraceParty {
  address: string;
  labels: ApiLabel[];
}

export interface ApiTrace {
  from: ApiTraceParty;
  to: ApiTraceParty;
  maxHops: number;
  hops: Array<{ from: ApiTraceParty; to: ApiTraceParty; asset: ApiFlowAsset; amount: string | null; amountUsd: number | null; txHash: string; blockNumber: number; timestamp: string }>;
  caveats: string[];
  search: { truncated: boolean; unscannedAddresses: number };
  dataStatus: CaseDataStatus;
}

export function toWalletTrace(chain: ChainId, trace: ApiTrace, computedAt: Date): WalletTrace {
  const notes = [...trace.caveats];
  if (trace.search.truncated) notes.push("Pencarian dipotong karena batas jumlah transfer yang diperiksa.");
  if (trace.search.unscannedAddresses > 0) notes.push(`${trace.search.unscannedAddresses} address yang dilewati belum pernah dipindai, jadi jalur lewat address itu tidak terlihat.`);
  return {
    chain,
    from: trace.from.address,
    fromLabel: toEntityLabel(trace.from.labels[0]),
    to: trace.to.address,
    toLabel: toEntityLabel(trace.to.labels[0]),
    maxHops: trace.maxHops,
    hops: trace.hops.map((hop) => ({
      from: hop.from.address,
      fromLabel: toEntityLabel(hop.from.labels[0]),
      to: hop.to.address,
      toLabel: toEntityLabel(hop.to.labels[0]),
      asset: toFlowAsset(hop.asset),
      amount: toNumber(hop.amount) ?? Number.NaN,
      ...(hop.amountUsd === null ? {} : { amountUsd: hop.amountUsd }),
      txHash: hop.txHash,
      timestamp: hop.timestamp,
    })),
    snapshot: {
      // Jalur dihitung saat diminta dari data tersimpan, jadi waktunya waktu hitung.
      fetchedAt: computedAt.toISOString(),
      blockNumber: Math.max(0, ...trace.hops.map((hop) => hop.blockNumber)),
      sources: [],
      dataStatus: trace.dataStatus,
      ...(notes.length > 0 ? { statusReason: notes.join(" ") } : {}),
    },
  };
}

export async function getWalletTrace(chain: ChainId, from: string, to: string): Promise<WalletTrace | null> {
  const trace = await apiJsonOrNull<ApiTrace>(`/traces/${seg(chain)}/${seg(from)}/${seg(to)}`);
  return trace ? toWalletTrace(chain, trace, new Date()) : null;
}
