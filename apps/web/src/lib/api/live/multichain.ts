/**
 * Jelajah Multichain dari API (`/api/multichain/:address`): aktivitas satu
 * address EVM di semua chain EVM dari pemindaian aliran dana tersimpan.
 * Angka chain yang belum dipindai tetap kosong, bukan nol.
 */
import type { BridgeMove, ChainActivity, ChainDataStatus, CrossChainActivity, EntityLabel, MultichainProfile } from "../../types";
import { ApiError, apiJson, seg } from "../http";
import { toChainId, toEntityLabel, toNumber, type ApiLabel } from "./common";
import { toFlowAsset, type ApiFlowAsset } from "./flows";

/** Batas aktivitas linimasa yang dimuat (maksimum backend 500). */
const ACTIVITY_LIMIT = 500;

interface ApiChainView {
  chain: { id: string };
  status: "complete" | "partial" | "stale" | "unavailable";
  statusReason: string | null;
  txCount: number | null;
  inUsd: number | null;
  outUsd: number | null;
  counterpartyCount: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
  balanceUsd: number | null;
  snapshotBlock: number | null;
  fetchedAt: string | null;
}

interface ApiActivity {
  id: string;
  chain: string;
  kind: "in" | "out" | "self" | "bridge_out" | "bridge_in";
  timestamp: string;
  counterparty: string;
  counterpartyLabels: ApiLabel[];
  asset: ApiFlowAsset;
  amount: string | null;
  amountUsd: number | null;
  txHash: string;
  bridgeId: number | null;
}

interface ApiBridge {
  id: number;
  fromChain: string;
  toChain: string | null;
  protocolId: string | null;
  status: BridgeMove["status"];
  amountUsd: number | null;
  sentTxHash: string;
  sentAt: string;
  receivedTxHash: string | null;
  receivedAt: string | null;
}

export interface ApiMultichainProfile {
  address: string;
  labels: ApiLabel[];
  scan: { scannedAt: string } | null;
  window: { from: string; to: string } | null;
  chains: ApiChainView[];
  activities: ApiActivity[];
  activityPage: { limit: number; truncated: boolean };
  bridges: ApiBridge[];
  sources: string[];
}

const STATUS: Record<ApiChainView["status"], ChainDataStatus> = { complete: "ok", partial: "partial", stale: "stale", unavailable: "unavailable" };

function bridgeLabel(bridge: ApiBridge, sent: ApiActivity | undefined): EntityLabel {
  return (
    toEntityLabel(sent?.counterpartyLabels[0]) ?? {
      type: "bridge",
      ...(bridge.protocolId ? { name: bridge.protocolId } : {}),
      source: "heuristic",
      sourceName: "OpenChain heuristic",
    }
  );
}

export function toMultichainProfile(response: ApiMultichainProfile): MultichainProfile {
  const fallbackTime = response.scan?.scannedAt ?? new Date(0).toISOString();
  const chains: ChainActivity[] = response.chains.flatMap((item) => {
    const chain = toChainId(item.chain.id);
    if (!chain) return [];
    return [
      {
        chain,
        status: STATUS[item.status],
        ...(item.statusReason ? { statusReason: item.statusReason } : {}),
        ...(item.fetchedAt ? { fetchedAt: item.fetchedAt } : {}),
        txCount: item.txCount,
        inUsd: item.inUsd,
        outUsd: item.outUsd,
        counterpartyCount: item.counterpartyCount,
        ...(item.firstSeen ? { firstSeen: item.firstSeen } : {}),
        ...(item.lastSeen ? { lastSeen: item.lastSeen } : {}),
        balanceUsd: item.balanceUsd,
        snapshotBlock: item.snapshotBlock,
      },
    ];
  });
  const activities: CrossChainActivity[] = response.activities.flatMap((item) => {
    const chain = toChainId(item.chain);
    if (!chain || item.kind === "self") return [];
    return [
      {
        id: item.id,
        chain,
        kind: item.kind,
        timestamp: item.timestamp,
        counterparty: item.counterparty,
        counterpartyLabel: toEntityLabel(item.counterpartyLabels[0]),
        asset: toFlowAsset(item.asset),
        amount: toNumber(item.amount) ?? Number.NaN,
        ...(item.amountUsd === null ? {} : { amountUsd: item.amountUsd }),
        txHash: item.txHash,
        ...(item.bridgeId === null ? {} : { bridgeId: String(item.bridgeId) }),
      },
    ];
  });
  const bridges: BridgeMove[] = response.bridges.flatMap((bridge) => {
    const fromChain = toChainId(bridge.fromChain);
    if (!fromChain) return [];
    const sent = response.activities.find((item) => item.bridgeId === bridge.id && item.kind === "bridge_out");
    const received = response.activities.find((item) => item.bridgeId === bridge.id && item.kind === "bridge_in");
    return [
      {
        id: String(bridge.id),
        fromChain,
        toChain: toChainId(bridge.toChain),
        bridge: bridgeLabel(bridge, sent),
        asset: sent ? toFlowAsset(sent.asset) : { symbol: "?", address: null },
        amountSent: toNumber(sent?.amount) ?? Number.NaN,
        ...(received && toNumber(received.amount) !== null ? { amountReceived: toNumber(received.amount)! } : {}),
        ...(bridge.amountUsd === null ? {} : { amountUsd: bridge.amountUsd }),
        sentTxHash: bridge.sentTxHash,
        sentAt: bridge.sentAt,
        ...(bridge.receivedTxHash ? { receivedTxHash: bridge.receivedTxHash } : {}),
        ...(bridge.receivedAt ? { receivedAt: bridge.receivedAt } : {}),
        status: bridge.status,
      },
    ];
  });
  return {
    address: response.address,
    label: toEntityLabel(response.labels[0]),
    window: response.window ?? { from: fallbackTime, to: fallbackTime },
    chains,
    bridges,
    activities,
    fetchedAt: fallbackTime,
    sources: response.sources,
  };
}

export async function getMultichainProfile(address: string): Promise<MultichainProfile | null> {
  try {
    return toMultichainProfile(await apiJson<ApiMultichainProfile>(`/multichain/${seg(address)}`, { query: { limit: ACTIVITY_LIMIT } }));
  } catch (error) {
    // Address bukan EVM (400) atau tidak dikenal (404) dijawab "tidak ditemukan".
    if (error instanceof ApiError && (error.status === 400 || error.status === 404)) return null;
    throw error;
  }
}
