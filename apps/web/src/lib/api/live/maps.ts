/**
 * Peta Hubungan Wallet dari API (`/api/maps/:chain/:token`). Backend
 * membentuk peta dari snapshot holder dan transfer tersimpan saat pertama
 * diminta; kelompok dan gerak serempak ikut dalam respons. Peta diminta
 * dengan radius penuh supaya filter lapis di halaman bekerja di browser.
 */
import type { CaseDataStatus, ChainId, ClusterLabel, CoordinationEvent, MapCluster, WalletMap } from "../../types";
import { apiJsonOrNull, seg } from "../http";
import { toEntityLabel, toNumber, type ApiLabel } from "./common";
import { toFlowAsset, type ApiFlowAsset } from "./flows";

const MAP_RADIUS = 5;
const MAP_HOLDERS = 50;

interface ApiCluster {
  id: string;
  name: string;
  reason: string;
  labels: ClusterLabel[];
  confidence: MapCluster["confidence"];
  signals: Array<{ id: string; label: string; detail: string; matched: boolean; evidence: Array<{ txHash: string }> }>;
  caveats: string[];
}

interface ApiCoordination {
  id: string;
  kind: CoordinationEvent["kind"];
  detail: string;
  members: string[];
  confidence: CoordinationEvent["confidence"];
  timestamp: string;
  windowSeconds: number;
  blockNumber: number | null;
  transactions: Array<{ txHash: string; timestamp: string; blockNumber: number; action: CoordinationEvent["transactions"][number]["action"]; from: string; to: string; asset: ApiFlowAsset; amount: string | null; amountUsd: number | null }>;
}

export interface ApiWalletMap {
  token: { address: string; name: string | null; symbol: string | null };
  map: { statusReason: string | null } | null;
  nodes: Array<{ address: string; sharePct: number; isContract: boolean | null; labels: ApiLabel[]; clusterId: string | null }>;
  edges: Array<{ id: string; kind: "funding" | "token_transfer"; from: string; to: string; asset: ApiFlowAsset; amount: string | null; amountUsd: number | null; txHash: string; timestamp: string }>;
  clusters: ApiCluster[];
  coordination: ApiCoordination[];
  snapshot: { fetchedAt: string; blockNumber: number; sources: string[] } | null;
  dataStatus: CaseDataStatus;
  emptyState: { message?: string; title?: string } | null;
}

const unique = (values: string[]) => [...new Set(values)];

export function toWalletMap(chain: ChainId, response: ApiWalletMap): WalletMap {
  return {
    chain,
    token: { address: response.token.address, name: response.token.name ?? "Token tanpa nama", symbol: response.token.symbol ?? "?" },
    nodes: response.nodes.map((node) => ({
      address: node.address,
      label: toEntityLabel(node.labels[0]),
      sharePct: node.sharePct,
      isContract: node.isContract,
      ...(node.clusterId ? { clusterId: node.clusterId } : {}),
    })),
    edges: response.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      asset: toFlowAsset(edge.asset),
      amount: toNumber(edge.amount) ?? Number.NaN,
      ...(edge.amountUsd === null ? {} : { amountUsd: edge.amountUsd }),
      txHash: edge.txHash,
      timestamp: edge.timestamp,
    })),
    clusters: response.clusters.map((cluster) => ({
      id: cluster.id,
      name: cluster.name,
      reason: cluster.reason,
      labels: cluster.labels,
      confidence: cluster.confidence,
      signals: cluster.signals.map((signal) => ({ id: signal.id, label: signal.label, detail: signal.detail, matched: signal.matched, evidenceTxHashes: unique(signal.evidence.map((item) => item.txHash)) })),
      caveats: cluster.caveats,
    })),
    coordination: response.coordination.map((event) => ({
      id: event.id,
      kind: event.kind,
      detail: event.detail,
      members: event.members,
      confidence: event.confidence,
      timestamp: event.timestamp,
      windowSeconds: event.windowSeconds,
      ...(event.blockNumber === null ? {} : { blockNumber: event.blockNumber }),
      transactions: event.transactions.map((tx) => ({
        txHash: tx.txHash,
        timestamp: tx.timestamp,
        blockNumber: tx.blockNumber,
        action: tx.action,
        from: tx.from,
        to: tx.to,
        asset: toFlowAsset(tx.asset),
        amount: toNumber(tx.amount) ?? Number.NaN,
        ...(tx.amountUsd === null ? {} : { amountUsd: tx.amountUsd }),
      })),
    })),
    snapshot: {
      fetchedAt: response.snapshot?.fetchedAt ?? new Date(0).toISOString(),
      blockNumber: response.snapshot?.blockNumber ?? 0,
      sources: response.snapshot?.sources ?? [],
      dataStatus: response.snapshot ? response.dataStatus : "unavailable",
      ...(response.map?.statusReason ? { statusReason: response.map.statusReason } : response.snapshot ? {} : { statusReason: "Token ini belum punya snapshot holder, jadi peta belum bisa dibentuk." }),
    },
  };
}

export async function getWalletMap(chain: ChainId, token: string): Promise<WalletMap | null> {
  const response = await apiJsonOrNull<ApiWalletMap>(`/maps/${seg(chain)}/${seg(token)}`, { query: { radius: MAP_RADIUS, holders: MAP_HOLDERS } });
  return response ? toWalletMap(chain, response) : null;
}
