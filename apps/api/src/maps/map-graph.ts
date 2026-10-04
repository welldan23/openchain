/**
 * Pembentukan graf interaksi wallet untuk Peta Hubungan Wallet.
 *
 * Titik (node) peta adalah holder teratas sebuah token, wallet yang mendanai
 * mereka, dan wallet penghubung yang bertransaksi token dengan beberapa
 * holder sekaligus. Garis (edge) selalu satu transfer tersimpan, jadi setiap
 * hubungan punya bukti transaksi on-chain.
 *
 * Pendanaan ditelusuri ke belakang per lapis: kiriman native coin paling
 * awal ke tiap wallet, yang terjadi sebelum wallet itu dipakai. Hub
 * (exchange, router, bridge, pool, market maker) dan kontrak tetap tampil
 * sebagai pendana, tapi tidak ditelusuri lebih jauh karena dana di sana
 * tercampur dengan dana orang lain. Pengirim kiriman internal juga tidak
 * ditelusuri: kiriman itu lahir dari eksekusi kode kontrak, bukan langsung
 * dari pemilik wallet. Address nol/dead tidak pernah dianggap pendana atau
 * penghubung.
 *
 * Kelengkapan dihitung jujur: wallet yang riwayatnya belum dipindai lengkap
 * dan batas yang memotong peta disebutkan, bukan disembunyikan.
 */
import type { DataStatus, MapEdgeKind, MapNodeRole } from '../database/schema/enums.js';

/** Holder pada snapshot dasar peta. */
export interface GraphHolder {
  addressId: number;
  /** Persen supply, string desimal seperti di database. */
  sharePct: string;
}

/** Satu transfer tersimpan yang bisa jadi garis peta. */
export interface GraphTransfer {
  /** `native` dan `internal` ada di `native_transfers`, `token` di `token_transfers`. */
  source: 'native' | 'internal' | 'token';
  id: number;
  fromId: number;
  toId: number;
  blockNumber: number;
}

/** Fakta address yang menentukan boleh tidaknya ditelusuri. */
export interface AddressProfile {
  isContract: boolean | null;
  /** Berlabel exchange, router, bridge, pool, atau market maker. */
  hub: boolean;
  /** Address nol atau dead. */
  burn: boolean;
}

/**
 * Kelengkapan riwayat sebuah address sampai blok peta:
 * `full` = native, internal, dan token terbaca dari awal sampai blok peta;
 * `partial` = pernah dipindai tapi belum lengkap; `none` = belum dipindai.
 */
export type HistoryCoverage = 'full' | 'partial' | 'none';

/** Sumber data graf; semua query sudah dibatasi chain, token, dan blok peta. */
export interface MapGraphLoader {
  /**
   * Kiriman native (termasuk internal) ke tiap address frontier sampai blok
   * maksimumnya, paling awal dulu, paling banyak `perAddress` per address.
   */
  incomingFunding(frontier: ReadonlyArray<{ addressId: number; maxBlock: number }>, perAddress: number): Promise<GraphTransfer[]>;
  /**
   * Transfer token peta di antara address yang diberikan, paling awal dulu,
   * paling banyak `perPair` per pasangan arah, paling banyak `limit` baris.
   */
  tokenTransfersAmong(addressIds: number[], perPair: number, limit: number): Promise<GraphTransfer[]>;
  /** Address bukan holder yang bertransaksi token peta dengan minimal dua holder, terbanyak dulu. */
  connectorCandidates(holderIds: number[], limit: number): Promise<Array<{ addressId: number; holderCount: number }>>;
  profiles(addressIds: number[]): Promise<Map<number, AddressProfile>>;
  coverage(addressIds: number[]): Promise<Map<number, HistoryCoverage>>;
}

export interface MapGraphOptions {
  /** Lapis pendana yang ditelusuri, 0–5. */
  fundingDepth: number;
  /** Kiriman native paling awal yang diambil per wallet. */
  fundingPerAddress?: number;
  /** Transfer token yang diambil per pasangan wallet (per arah). */
  transfersPerPair?: number;
  maxNodes?: number;
  maxEdges?: number;
  maxConnectors?: number;
}

export interface GraphNode {
  addressId: number;
  role: MapNodeRole;
  /** Persen supply; `'0'` untuk pendana dan penghubung. */
  sharePct: string;
  isContract: boolean | null;
}

export interface GraphEdge {
  kind: MapEdgeKind;
  fromId: number;
  toId: number;
  nativeTransferId: number | null;
  tokenTransferId: number | null;
}

export interface MapGraphCoverage {
  holders: Record<HistoryCoverage, number>;
  /** Pendana yang ditelusuri ke lapis berikutnya tapi riwayatnya belum lengkap. */
  fundersIncomplete: number;
  /** Hub atau kontrak yang tidak ditelusuri lebih jauh. */
  notTraversed: number;
}

export interface MapGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  coverage: MapGraphCoverage;
  status: DataStatus;
  statusReason: string | null;
  missingFields: string[];
}

export const MAP_GRAPH_DEFAULTS = {
  fundingPerAddress: 3,
  transfersPerPair: 3,
  maxNodes: 400,
  maxEdges: 2_000,
  maxConnectors: 30,
} as const;

/** Kandidat penghubung yang diambil sebelum disaring hub/kontrak. */
const CONNECTOR_CANDIDATE_FACTOR = 4;

function edgeKey(transfer: GraphTransfer): string {
  return `${transfer.source === 'token' ? 'token' : 'native'}:${transfer.id}`;
}

function toEdge(transfer: GraphTransfer): GraphEdge {
  const isToken = transfer.source === 'token';
  return {
    kind: isToken ? 'token_transfer' : 'funding',
    fromId: transfer.fromId,
    toId: transfer.toId,
    nativeTransferId: isToken ? null : transfer.id,
    tokenTransferId: isToken ? transfer.id : null,
  };
}

/** Hub, kontrak, dan address nol tidak ditelusuri; dananya tercampur atau bukan milik siapa pun. */
function traversable(profile: AddressProfile | undefined): boolean {
  return !profile || (!profile.hub && !profile.burn && profile.isContract !== true);
}

export async function buildMapGraph(holders: readonly GraphHolder[], loader: MapGraphLoader, options: MapGraphOptions): Promise<MapGraph> {
  const perAddress = options.fundingPerAddress ?? MAP_GRAPH_DEFAULTS.fundingPerAddress;
  const perPair = options.transfersPerPair ?? MAP_GRAPH_DEFAULTS.transfersPerPair;
  const maxNodes = Math.max(options.maxNodes ?? MAP_GRAPH_DEFAULTS.maxNodes, holders.length);
  const maxEdges = options.maxEdges ?? MAP_GRAPH_DEFAULTS.maxEdges;
  const maxConnectors = options.maxConnectors ?? MAP_GRAPH_DEFAULTS.maxConnectors;

  const emptyCoverage: MapGraphCoverage = { holders: { full: 0, partial: 0, none: 0 }, fundersIncomplete: 0, notTraversed: 0 };
  if (holders.length === 0) {
    return {
      nodes: [],
      edges: [],
      coverage: emptyCoverage,
      status: 'unavailable',
      statusReason: 'Snapshot dasar tidak punya data holder, jadi peta belum bisa dibentuk.',
      missingFields: ['holders'],
    };
  }

  const holderIds = holders.map((holder) => holder.addressId);
  const profiles = await loader.profiles(holderIds);
  const nodes = new Map<number, GraphNode>(
    holders.map((holder) => [
      holder.addressId,
      { addressId: holder.addressId, role: 'holder', sharePct: holder.sharePct, isContract: profiles.get(holder.addressId)?.isContract ?? null },
    ]),
  );
  const edges = new Map<string, GraphEdge>();
  const limits = new Set<'node_limit' | 'edge_limit' | 'connector_limit'>();
  let notTraversed = 0;

  // Riwayat yang wajib lengkap: holder yang pendanaan dan transfernya dibaca.
  const traversedHolders = holderIds.filter((id) => traversable(profiles.get(id)));
  if (options.fundingDepth > 0) notTraversed += holderIds.length - traversedHolders.length;
  const needsHistory = new Set<number>(traversedHolders);
  const tracedFunders: number[] = [];

  let frontier = traversedHolders.map((addressId) => ({ addressId, maxBlock: Number.MAX_SAFE_INTEGER }));
  for (let depth = 1; depth <= options.fundingDepth && frontier.length > 0; depth++) {
    const incoming = await loader.incomingFunding(frontier, perAddress);
    const newIds = [...new Set(incoming.map((transfer) => transfer.fromId))].filter((id) => !nodes.has(id) && !profiles.has(id));
    for (const [id, profile] of await loader.profiles(newIds)) profiles.set(id, profile);

    // Blok terakhir tiap pendana baru mengirim dana; pendanaannya harus sebelum itu.
    const sentUntil = new Map<number, number>();
    // Kiriman internal lahir dari eksekusi kode kontrak: dananya bisa milik siapa saja.
    const sentByCode = new Set<number>();
    for (const transfer of incoming) {
      if (profiles.get(transfer.fromId)?.burn) continue;
      if (transfer.source === 'internal') sentByCode.add(transfer.fromId);
      if (!nodes.has(transfer.fromId)) {
        if (nodes.size >= maxNodes) {
          limits.add('node_limit');
          continue;
        }
        nodes.set(transfer.fromId, {
          addressId: transfer.fromId,
          role: 'funder',
          sharePct: '0',
          isContract: profiles.get(transfer.fromId)?.isContract ?? null,
        });
        sentUntil.set(transfer.fromId, transfer.blockNumber);
      } else if (sentUntil.has(transfer.fromId)) {
        sentUntil.set(transfer.fromId, Math.max(sentUntil.get(transfer.fromId) ?? 0, transfer.blockNumber));
      }
      if (edges.size >= maxEdges) {
        limits.add('edge_limit');
        continue;
      }
      edges.set(edgeKey(transfer), toEdge(transfer));
    }

    frontier = [];
    if (depth === options.fundingDepth) break;
    for (const [addressId, maxBlock] of sentUntil) {
      if (!traversable(profiles.get(addressId)) || sentByCode.has(addressId)) {
        notTraversed++;
        continue;
      }
      frontier.push({ addressId, maxBlock });
      tracedFunders.push(addressId);
    }
  }

  // Penghubung: bukan holder, bertransaksi token dengan beberapa holder.
  if (maxConnectors > 0) {
    const candidates = await loader.connectorCandidates(holderIds, maxConnectors * CONNECTOR_CANDIDATE_FACTOR);
    const unknown = candidates.map((candidate) => candidate.addressId).filter((id) => !profiles.has(id));
    for (const [id, profile] of await loader.profiles(unknown)) profiles.set(id, profile);
    let added = 0;
    for (const candidate of candidates) {
      if (nodes.has(candidate.addressId) || !traversable(profiles.get(candidate.addressId))) continue;
      if (added >= maxConnectors) {
        limits.add('connector_limit');
        break;
      }
      if (nodes.size >= maxNodes) {
        limits.add('node_limit');
        break;
      }
      nodes.set(candidate.addressId, {
        addressId: candidate.addressId,
        role: 'connector',
        sharePct: '0',
        isContract: profiles.get(candidate.addressId)?.isContract ?? null,
      });
      added++;
    }
  }

  const room = maxEdges - edges.size;
  if (room > 0) {
    const transfers = await loader.tokenTransfersAmong([...nodes.keys()], perPair, room + 1);
    for (const transfer of transfers) {
      if (transfer.fromId === transfer.toId || !nodes.has(transfer.fromId) || !nodes.has(transfer.toId)) continue;
      if (edges.size >= maxEdges) {
        limits.add('edge_limit');
        break;
      }
      edges.set(edgeKey(transfer), toEdge(transfer));
    }
  } else {
    limits.add('edge_limit');
  }

  const coverageById = await loader.coverage([...needsHistory, ...tracedFunders]);
  const holderCoverage = { full: 0, partial: 0, none: 0 };
  for (const id of holderIds) {
    // Holder yang tidak ditelusuri (hub/kontrak) tidak butuh riwayat pendanaan.
    if (!needsHistory.has(id)) continue;
    holderCoverage[coverageById.get(id) ?? 'none']++;
  }
  const fundersIncomplete = tracedFunders.filter((id) => coverageById.get(id) !== 'full').length;

  const reasons: string[] = [];
  const missingFields: string[] = [];
  const unscanned = holderCoverage.partial + holderCoverage.none;
  if (unscanned > 0) {
    missingFields.push('holder_history');
    const parts = [
      holderCoverage.none > 0 ? `${holderCoverage.none} belum dipindai` : null,
      holderCoverage.partial > 0 ? `${holderCoverage.partial} baru terbaca sebagian` : null,
    ].filter((part): part is string => part !== null);
    reasons.push(
      `Riwayat ${unscanned} dari ${needsHistory.size} holder belum lengkap (${parts.join(', ')}); pendanaan dan transfer mereka bisa belum terlihat.`,
    );
  }
  if (fundersIncomplete > 0) {
    missingFields.push('funder_history');
    reasons.push(`Riwayat ${fundersIncomplete} wallet pendana belum lengkap; pendana lapis berikutnya bisa belum terlihat.`);
  }
  if (limits.has('node_limit')) reasons.push(`Peta dibatasi ${maxNodes} wallet; sebagian pendana atau penghubung tidak ditampilkan.`);
  if (limits.has('edge_limit')) reasons.push(`Peta dibatasi ${maxEdges} garis; sebagian transfer tidak ditampilkan.`);
  if (limits.has('connector_limit')) reasons.push(`Hanya ${maxConnectors} wallet penghubung teratas yang ditampilkan.`);
  missingFields.push(...limits);

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    coverage: { holders: holderCoverage, fundersIncomplete, notTraversed },
    status: reasons.length > 0 ? 'partial' : 'complete',
    statusReason: reasons.length > 0 ? reasons.join(' ') : null,
    missingFields,
  };
}
