/**
 * Pengelompokan wallet di Peta Hubungan Wallet (heuristic `openchain-cluster-v1`).
 *
 * Holder dikelompokkan bila terhubung lewat bukti transaksi di peta:
 * - punya pendana yang sama, langsung atau beberapa lapis ke belakang;
 * - saling kirim langsung (native atau token peta);
 * - memakai wallet penghubung yang sama.
 * Exchange, router, bridge, pool, market maker, kontrak, dan pengirim yang
 * hanya mengirim lewat kiriman internal tidak pernah menyatukan wallet, karena
 * dana di sana milik banyak orang. Kelompok wajib berisi minimal dua holder.
 *
 * Setiap kelompok membawa sinyal yang dicek (terpenuhi atau tidak) beserta
 * transfer buktinya, label, tingkat keyakinan, dan catatan hal yang bisa
 * membuatnya keliru. Hasilnya selalu dugaan (`heuristic`), bukan bukti
 * kepemilikan. Label `insider_or_team` hanya dipakai bila ada transfer
 * langsung dari deployer token ke anggota.
 */
import type { ClusterLabel, ConfidenceLevel, MapEdgeKind, MapNodeRole } from '../database/schema/enums.js';
import type { TransferRef } from './maps.repository.js';

export const CLUSTER_HEURISTIC = 'openchain-cluster-v1';

/** Pendanaan dalam rentang ini dianggap berdekatan. */
export const FUNDING_WINDOW_SECONDS = 3_600;
/** Pendana yang menyatukan sebanyak ini holder bisa jadi layanan, bukan satu orang. */
export const MASS_FUNDER_HOLDERS = 10;
/** Kedalaman pendana yang diperiksa untuk pendana bersama. */
const MAX_ANCESTOR_DEPTH = 5;

export interface ClusterNode {
  id: number;
  addressId: number;
  address: string;
  role: MapNodeRole;
  sharePct: number;
  isContract: boolean | null;
  /** Berlabel exchange, router, bridge, pool, atau market maker. */
  hub: boolean;
}

export interface ClusterEdge {
  kind: MapEdgeKind;
  source: 'native' | 'internal' | 'token';
  transferId: number;
  fromNodeId: number;
  toNodeId: number;
  blockNumber: number;
  timestamp: Date;
}

/** Transfer tersimpan di luar garis peta yang dipakai sebagai bukti sinyal. */
export interface EvidenceTransfer extends TransferRef {
  fromAddressId: number;
  toAddressId: number;
  blockNumber: number;
  timestamp: Date;
}

/** Query tambahan; semuanya dibatasi chain, token, dan blok peta. */
export interface ClusterLoader {
  /** Transfer token peta pertama yang diterima tiap address. */
  firstReceipts(addressIds: number[]): Promise<EvidenceTransfer[]>;
  /** Transfer native (termasuk internal) dan token peta dari salah satu `fromIds` ke salah satu `toIds`. */
  transfersBetween(fromIds: number[], toIds: number[]): Promise<EvidenceTransfer[]>;
}

export interface ClusterInput {
  nodes: readonly ClusterNode[];
  edges: readonly ClusterEdge[];
  /** Address deployer token; `null` bila tidak diketahui. */
  deployerAddressId: number | null;
  /** Status peta lengkap; bila tidak, ada catatan bahwa anggota bisa terlewat. */
  mapComplete: boolean;
}

export interface ClusterSignal {
  key: string;
  label: string;
  detail: string;
  matched: boolean;
  evidence: TransferRef[];
}

export interface WalletCluster {
  key: string;
  name: string;
  reason: string;
  labels: ClusterLabel[];
  confidence: ConfidenceLevel;
  caveats: string[];
  hasDirectEvidence: boolean;
  memberNodeIds: number[];
  signals: ClusterSignal[];
}

class UnionFind {
  private readonly parent = new Map<number, number>();

  find(id: number): number {
    let root = id;
    while ((this.parent.get(root) ?? root) !== root) root = this.parent.get(root) ?? root;
    this.parent.set(id, root);
    return root;
  }

  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(Math.max(rootA, rootB), Math.min(rootA, rootB));
  }
}

function edgeRef(edge: ClusterEdge): TransferRef {
  return { table: edge.source === 'token' ? 'token' : 'native', id: edge.transferId };
}

function uniqueRefs(refs: readonly TransferRef[]): TransferRef[] {
  const seen = new Map(refs.map((ref) => [`${ref.table}:${ref.id}`, ref]));
  return [...seen.values()];
}

function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function minutes(seconds: number): string {
  return seconds < 60 ? `${seconds} detik` : `${Math.round(seconds / 60)} menit`;
}

/** Nama kelompok berurutan: A, B, …, Z, AA, AB, … */
function letter(index: number): string {
  let value = index;
  let result = '';
  do {
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return result;
}

/** Rentang terpendek yang memuat paling banyak waktu, paling banyak `window` detik. */
function densestWindow<T extends { at: number }>(items: readonly T[], windowSeconds: number): T[] {
  const sorted = [...items].sort((a, b) => a.at - b.at);
  let best: T[] = [];
  let start = 0;
  for (let end = 0; end < sorted.length; end++) {
    while (sorted[end].at - sorted[start].at > windowSeconds * 1000) start++;
    if (end - start + 1 > best.length) best = sorted.slice(start, end + 1);
  }
  return best;
}

export async function clusterWallets(input: ClusterInput, loader: ClusterLoader): Promise<WalletCluster[]> {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const holders = input.nodes.filter((node) => node.role === 'holder');

  // Pengirim yang semua kirimannya internal bergerak lewat kode kontrak.
  const sendsDirectly = new Set(input.edges.filter((edge) => edge.source !== 'internal').map((edge) => edge.fromNodeId));
  const linkable = (id: number) => {
    const node = nodeById.get(id);
    if (!node || node.hub || node.isContract === true) return false;
    return node.role === 'holder' || node.role === 'connector' || sendsDirectly.has(id);
  };

  const fundingInto = new Map<number, ClusterEdge[]>();
  for (const edge of input.edges) {
    if (edge.kind !== 'funding') continue;
    fundingInto.set(edge.toNodeId, [...(fundingInto.get(edge.toNodeId) ?? []), edge]);
  }

  // Pendana (langsung dan lapis berikutnya) tiap holder, hanya lewat wallet yang boleh menyatukan.
  const ancestors = new Map<number, Map<number, number>>();
  for (const holder of holders) {
    if (!linkable(holder.id)) continue;
    const found = new Map<number, number>();
    let frontier = [holder.id];
    for (let depth = 1; depth <= MAX_ANCESTOR_DEPTH && frontier.length > 0; depth++) {
      const next: number[] = [];
      for (const id of frontier) {
        for (const edge of fundingInto.get(id) ?? []) {
          const funder = edge.fromNodeId;
          if (found.has(funder) || funder === holder.id || !linkable(funder)) continue;
          // Holder yang mendanai holder lain dihitung sebagai kiriman langsung, bukan pendana bersama.
          if (nodeById.get(funder)?.role === 'holder') continue;
          found.set(funder, depth);
          next.push(funder);
        }
      }
      frontier = next;
    }
    ancestors.set(holder.id, found);
  }

  // Holder yang berbagi pendana (lapis berapa pun) jadi satu kelompok, beserta pendana-pendananya.
  const groups = new UnionFind();
  const holdersByAncestor = new Map<number, number[]>();
  for (const [holderId, found] of ancestors) {
    for (const funder of found.keys()) {
      groups.union(funder, holderId);
      holdersByAncestor.set(funder, [...(holdersByAncestor.get(funder) ?? []), holderId]);
    }
  }

  const isHolder = (id: number) => nodeById.get(id)?.role === 'holder';
  const directEdges = input.edges.filter(
    (edge) => isHolder(edge.fromNodeId) && isHolder(edge.toNodeId) && linkable(edge.fromNodeId) && linkable(edge.toNodeId),
  );
  for (const edge of directEdges) groups.union(edge.fromNodeId, edge.toNodeId);

  const connectorLinks = new Map<number, ClusterEdge[]>();
  for (const edge of input.edges) {
    for (const [connector, other] of [
      [edge.fromNodeId, edge.toNodeId],
      [edge.toNodeId, edge.fromNodeId],
    ] as const) {
      if (nodeById.get(connector)?.role !== 'connector' || !linkable(connector) || !isHolder(other) || !linkable(other)) continue;
      connectorLinks.set(connector, [...(connectorLinks.get(connector) ?? []), edge]);
    }
  }
  for (const [connector, links] of connectorLinks) {
    const linkedHolders = new Set(links.map((edge) => (edge.fromNodeId === connector ? edge.toNodeId : edge.fromNodeId)));
    if (linkedHolders.size < 2) continue;
    for (const holderId of linkedHolders) groups.union(connector, holderId);
  }

  // Komponen dengan minimal dua holder.
  const components = new Map<number, number[]>();
  const involved = new Set<number>([...holdersByAncestor.keys(), ...ancestors.keys(), ...connectorLinks.keys()]);
  for (const edge of directEdges) involved.add(edge.fromNodeId).add(edge.toNodeId);
  for (const id of involved) {
    const root = groups.find(id);
    components.set(root, [...(components.get(root) ?? []), id]);
  }
  const candidates = [...components.values()]
    .map((members) => [...new Set(members)].sort((a, b) => a - b))
    .filter((members) => members.filter(isHolder).length >= 2);

  const memberHolderAddresses = candidates.flatMap((members) => members.filter(isHolder).map((id) => nodeById.get(id)!.addressId));
  const receipts = await loader.firstReceipts(memberHolderAddresses);
  const receiptByAddress = new Map(receipts.map((receipt) => [receipt.toAddressId, receipt]));

  const share = (members: number[]) => members.reduce((sum, id) => sum + (isHolder(id) ? (nodeById.get(id)?.sharePct ?? 0) : 0), 0);
  candidates.sort((a, b) => share(b) - share(a) || a[0] - b[0]);

  const clusters: WalletCluster[] = [];
  for (const [index, members] of candidates.entries()) {
    const memberSet = new Set(members);
    const memberHolders = members.filter(isHolder);
    const funders = members.filter((id) => !isHolder(id) && nodeById.get(id)?.role === 'funder');
    const fundingEdges = input.edges.filter((edge) => edge.kind === 'funding' && memberSet.has(edge.fromNodeId) && memberSet.has(edge.toNodeId));
    const signals: ClusterSignal[] = [];

    // 1. Pendana yang sama.
    const shared = funders
      .map((funder) => ({ funder, holders: (holdersByAncestor.get(funder) ?? []).filter((id) => memberSet.has(id)) }))
      .filter((item) => item.holders.length >= 2)
      .sort((a, b) => b.holders.length - a.holders.length || a.funder - b.funder);
    const top = shared[0];
    const topDepth = top ? Math.max(...top.holders.map((id) => ancestors.get(id)?.get(top.funder) ?? 1)) : 0;
    signals.push({
      key: 'common-funder',
      label: 'Pendana yang sama',
      detail: top
        ? topDepth === 1
          ? `${top.holders.length} wallet menerima dana langsung dari ${short(nodeById.get(top.funder)!.address)}.`
          : `${top.holders.length} wallet berasal dari pendana yang sama (${short(nodeById.get(top.funder)!.address)}), lewat ${topDepth - 1} lapis perantara.`
        : 'Tidak ada pendana bersama di antara anggota.',
      matched: top !== undefined,
      evidence: top ? fundingEdges.map(edgeRef) : [],
    });

    // 2. Didanai dalam waktu berdekatan: kiriman pertama dari pendana kelompok ke tiap holder.
    const firstFunding = memberHolders.flatMap((holderId) => {
      const incoming = (fundingInto.get(holderId) ?? []).filter((edge) => memberSet.has(edge.fromNodeId));
      const first = incoming.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())[0];
      return first ? [{ at: first.timestamp.getTime(), edge: first }] : [];
    });
    const window = densestWindow(firstFunding, FUNDING_WINDOW_SECONDS);
    const windowSeconds = window.length >= 2 ? Math.round((window[window.length - 1].at - window[0].at) / 1000) : 0;
    signals.push({
      key: 'funding-window',
      label: 'Didanai dalam waktu berdekatan',
      detail:
        window.length >= 2
          ? `${window.length} wallet didanai dalam ${minutes(windowSeconds)}.`
          : `Tidak ada dua wallet yang didanai pendana kelompok dalam ${minutes(FUNDING_WINDOW_SECONDS)}.`,
      matched: window.length >= 2,
      evidence: window.length >= 2 ? window.map((item) => edgeRef(item.edge)) : [],
    });

    // 3. Saling kirim langsung.
    const direct = directEdges.filter((edge) => memberSet.has(edge.fromNodeId) && memberSet.has(edge.toNodeId));
    signals.push({
      key: 'direct-transfer',
      label: 'Saling kirim langsung',
      detail: direct.length > 0 ? `${direct.length} transfer langsung di antara holder anggota.` : 'Tidak ada transfer langsung di antara holder anggota.',
      matched: direct.length > 0,
      evidence: direct.map(edgeRef),
    });

    // 4. Wallet penghubung yang sama.
    const connectorEdges = members.flatMap((id) => connectorLinks.get(id) ?? []);
    const connectors = members.filter((id) => connectorLinks.has(id) && nodeById.get(id)?.role === 'connector');
    signals.push({
      key: 'shared-connector',
      label: 'Perantara yang sama',
      detail:
        connectors.length > 0
          ? `Token anggota berpindah lewat ${connectors.length} wallet perantara yang sama.`
          : 'Tidak ada wallet perantara bersama.',
      matched: connectors.length > 0,
      evidence: uniqueRefs(connectorEdges.map(edgeRef)),
    });

    // 5. Menerima token peta pertama kali di blok yang sama.
    const byBlock = new Map<number, EvidenceTransfer[]>();
    for (const holderId of memberHolders) {
      const receipt = receiptByAddress.get(nodeById.get(holderId)!.addressId);
      if (receipt) byBlock.set(receipt.blockNumber, [...(byBlock.get(receipt.blockNumber) ?? []), receipt]);
    }
    const sameBlock = [...byBlock.values()].filter((items) => items.length >= 2).sort((a, b) => b.length - a.length)[0] ?? [];
    signals.push({
      key: 'same-block-receive',
      label: 'Menerima token di blok yang sama',
      detail:
        sameBlock.length >= 2
          ? `${sameBlock.length} wallet pertama kali menerima token ini di blok ${sameBlock[0].blockNumber}.`
          : 'Penerimaan token pertama anggota terjadi di blok yang berbeda.',
      matched: sameBlock.length >= 2,
      evidence: sameBlock.map(({ table, id }) => ({ table, id })),
    });

    // 6. Dana kembali ke pendana kelompok.
    const funderAddresses = funders.map((id) => nodeById.get(id)!.addressId);
    const holderAddresses = memberHolders.map((id) => nodeById.get(id)!.addressId);
    const returned = funderAddresses.length > 0 ? await loader.transfersBetween(holderAddresses, funderAddresses) : [];
    signals.push({
      key: 'consolidation',
      label: 'Dana kembali ke pendana',
      detail:
        returned.length > 0
          ? `${new Set(returned.map((transfer) => transfer.fromAddressId)).size} wallet mengirim dana kembali ke pendana kelompok.`
          : 'Belum ada dana yang dikirim kembali ke pendana kelompok.',
      matched: returned.length > 0,
      evidence: returned.map(({ table, id }) => ({ table, id })),
    });

    // 7. Transfer langsung dari deployer token.
    const fromDeployer =
      input.deployerAddressId === null ? [] : await loader.transfersBetween([input.deployerAddressId], [...holderAddresses, ...funderAddresses]);
    signals.push({
      key: 'deployer-link',
      label: 'Menerima langsung dari deployer',
      detail:
        input.deployerAddressId === null
          ? 'Deployer token belum diketahui, jadi hubungan dengan deployer belum bisa dicek.'
          : fromDeployer.length > 0
            ? `${new Set(fromDeployer.map((transfer) => transfer.toAddressId)).size} anggota menerima dana atau token langsung dari deployer.`
            : 'Tidak ada anggota yang menerima dana atau token langsung dari deployer.',
      matched: fromDeployer.length > 0,
      evidence: fromDeployer.map(({ table, id }) => ({ table, id })),
    });

    signals.forEach((signal) => (signal.evidence = uniqueRefs(signal.evidence)));
    const matched = new Set(signals.filter((signal) => signal.matched).map((signal) => signal.key));
    const hasDirectEvidence = matched.has('deployer-link');
    const massFunder = (top?.holders.length ?? 0) >= MASS_FUNDER_HOLDERS;

    const labels: ClusterLabel[] = [];
    if (matched.has('common-funder')) labels.push('common_funding');
    if (matched.has('direct-transfer') || matched.has('consolidation')) labels.push('likely_linked');
    if (matched.has('same-block-receive')) labels.push('bundled_or_sniper_activity');
    if (hasDirectEvidence) labels.push('insider_or_team');
    const strong = ['common-funder', 'funding-window', 'direct-transfer', 'same-block-receive', 'consolidation', 'deployer-link'].filter((key) =>
      matched.has(key),
    );
    if (strong.length === 0) labels.push('visual_cluster', 'inconclusive');
    else if (strong.length === 1 || massFunder) labels.push('false_positive_possible');

    const confidence: ConfidenceLevel = hasDirectEvidence || strong.length >= 3 ? 'high' : strong.length === 2 ? 'medium' : 'low';

    const caveats: string[] = [];
    if (matched.has('common-funder')) caveats.push('Pendana bersama belum tentu pemilik yang sama; bisa juga layanan yang mendanai banyak pengguna.');
    if (massFunder) caveats.push(`Satu pendana menyatukan ${top!.holders.length} holder sekaligus, pola yang juga cocok untuk exchange atau layanan tanpa label.`);
    if (funders.some((id) => (fundingInto.get(id) ?? []).some((edge) => nodeById.get(edge.fromNodeId)?.hub))) {
      caveats.push('Pendana kelompok mendapat dana dari exchange atau hub, jadi asal dana sebelum itu tidak bisa dilacak lebih jauh.');
    }
    if (hasDirectEvidence) caveats.push('Transfer langsung dari deployer adalah bukti keterkaitan, tapi belum membuktikan niat menjual bersama.');
    if (strong.length === 0) caveats.push('Kelompok ini hanya terhubung lewat wallet perantara; belum ada bukti lain yang mendukung.');
    if (!input.mapComplete) caveats.push('Data peta belum lengkap, jadi anggota atau sinyal kelompok ini bisa terlewat.');

    const reason = signals
      .filter((signal) => signal.matched)
      .map((signal) => signal.detail.replace(/\.$/, ''))
      .join('; ');

    clusters.push({
      key: `kelompok-${nodeById.get(memberHolders[0])!.address.toLowerCase()}`,
      name: `Kelompok ${letter(index)}`,
      reason: `${reason}.`,
      labels,
      confidence,
      caveats,
      hasDirectEvidence,
      memberNodeIds: members,
      signals,
    });
  }
  return clusters;
}
