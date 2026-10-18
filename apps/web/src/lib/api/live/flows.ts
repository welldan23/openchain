/**
 * Lacak Aliran Dana dari API: ringkasan pemindaian tersimpan dan daftar
 * transfernya (diambil per halaman sampai batas). Transfer ke diri sendiri
 * tidak ditampilkan sebagai masuk/keluar. Bila transfer melebihi batas,
 * halaman ditandai sebagian beserta alasannya, tidak dianggap lengkap.
 */
import type { AddressFlow, CaseDataStatus, ChainId, FlowAsset, FlowTransfer } from "../../types";
import { apiJson, apiJsonOrNull, seg } from "../http";
import { toChainId, toEntityLabel, toNumber, type ApiLabel } from "./common";

/** Batas transfer yang dibaca untuk satu halaman (200 per permintaan). */
export const MAX_FLOW_TRANSFERS = 2000;
const PAGE_SIZE = 200;

export type ApiFlowAsset = { type: "native"; symbol: string; decimals: number | null } | { type: "token"; address: string; symbol: string | null; name: string | null; decimals: number | null };

interface ApiScan {
  scannedAt: string;
  blockTo: number;
  dataStatus: CaseDataStatus;
  statusReason: string | null;
}

export interface ApiFlowSummary {
  address: string;
  labels: ApiLabel[];
  scan: ApiScan | null;
  window: { from: string; to: string } | null;
  totals: { in: { transferCount: number }; out: { transferCount: number }; selfTransferCount: number } | null;
  dataStatus: CaseDataStatus;
}

export interface ApiFlowTransfer {
  id: string;
  direction: "in" | "out" | "self";
  counterparty: { address: string; labels: ApiLabel[] };
  asset: ApiFlowAsset;
  amount: string | null;
  amountUsd: number | null;
  txHash: string;
  timestamp: string;
}

export function toFlowAsset(asset: ApiFlowAsset): FlowAsset {
  return asset.type === "native" ? { symbol: asset.symbol, address: null } : { symbol: asset.symbol ?? "?", address: asset.address };
}

export function toFlowTransfer(item: ApiFlowTransfer): FlowTransfer | null {
  if (item.direction === "self") return null;
  return {
    id: item.id,
    direction: item.direction,
    counterparty: item.counterparty.address,
    counterpartyLabel: toEntityLabel(item.counterparty.labels[0]),
    asset: toFlowAsset(item.asset),
    // Jumlah tanpa decimals token tidak bisa dibaca; NaN ditampilkan sebagai "–", bukan nol.
    amount: toNumber(item.amount) ?? Number.NaN,
    ...(item.amountUsd === null ? {} : { amountUsd: item.amountUsd }),
    txHash: item.txHash,
    timestamp: item.timestamp,
  };
}

export function toAddressFlow(chain: ChainId, summary: ApiFlowSummary, items: ApiFlowTransfer[], truncated: boolean): AddressFlow {
  const scan = summary.scan;
  const reasons = [scan?.statusReason, truncated ? `Hanya ${MAX_FLOW_TRANSFERS.toLocaleString("id-ID")} transfer terbaru yang dimuat; total dan lawan transaksi dihitung dari transfer yang dimuat saja.` : null].filter(Boolean);
  const dataStatus: CaseDataStatus = truncated && summary.dataStatus === "complete" ? "partial" : summary.dataStatus;
  return {
    chain,
    address: summary.address,
    label: toEntityLabel(summary.labels[0]),
    window: summary.window ?? { from: scan?.scannedAt ?? new Date(0).toISOString(), to: scan?.scannedAt ?? new Date(0).toISOString() },
    transfers: items.map(toFlowTransfer).filter((transfer) => transfer !== null),
    snapshot: {
      fetchedAt: scan?.scannedAt ?? new Date(0).toISOString(),
      blockNumber: scan?.blockTo ?? 0,
      sources: [],
      dataStatus,
      ...(reasons.length > 0 ? { statusReason: reasons.join(" ") } : {}),
    },
  };
}

export async function getAddressFlow(chain: ChainId, address: string): Promise<AddressFlow | null> {
  const base = `/flows/${seg(chain)}/${seg(address)}`;
  const summary = await apiJsonOrNull<ApiFlowSummary>(`${base}/summary`);
  if (!summary) return null;
  const items: ApiFlowTransfer[] = [];
  let cursor: string | null = null;
  do {
    const page: { items: ApiFlowTransfer[]; nextCursor: string | null } = await apiJson(`${base}/transfers`, { query: { limit: PAGE_SIZE, cursor } });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor && items.length < MAX_FLOW_TRANSFERS);
  return toAddressFlow(chain, summary, items, cursor !== null);
}

export async function listFlowChains(address: string): Promise<Array<{ chain: ChainId; hasData: boolean }>> {
  const response = await apiJsonOrNull<{ chains: Array<{ chain: { id: string }; known: boolean }> }>(`/flows/${seg(address)}/chains`);
  return (response?.chains ?? []).flatMap((entry) => {
    const chain = toChainId(entry.chain.id);
    return chain ? [{ chain, hasData: entry.known }] : [];
  });
}
