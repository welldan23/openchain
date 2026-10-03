/**
 * Logika halaman Peta Hubungan Wallet: ukuran gelembung, warna klaster,
 * tata letak, dan ringkasan.
 *
 * Tata letak memakai simulasi gaya sederhana yang deterministik: posisi awal
 * dari urutan node, bukan angka acak, jadi peta yang sama selalu tampil sama
 * dan bisa dibandingkan antar-snapshot.
 */
import { addressKey } from "./fund-flow";
import type { ChainId, MapCluster, MapEdge, MapNode, WalletMap } from "./types";

/** Warna klaster dari palet kategorikal (mode gelap), lolos cek semua pasangan. */
export const CLUSTER_COLORS = ["#3987e5", "#d95926", "#199e70"] as const;
/** Wallet tanpa klaster, atau klaster ke-4 dst. yang digabung jadi "lainnya". */
export const NEUTRAL_NODE_COLOR = "#5b6b82";

export const MAP_WIDTH = 720;
export const MAP_HEIGHT = 480;

const MIN_RADIUS = 9;
const MAX_RADIUS = 46;
/** Wallet penghubung yang bukan holder digambar kecil. */
const LINK_ONLY_RADIUS = 6;
/** Jarak minimum antar tepi gelembung, termasuk cincin 2px. */
const NODE_GAP = 6;
const ITERATIONS = 360;

export interface PlacedNode {
  node: MapNode;
  x: number;
  y: number;
  r: number;
}

export interface ClusterStyle {
  cluster: MapCluster;
  /** `null` untuk klaster yang digabung ke "lainnya". */
  color: string | null;
  memberCount: number;
  /** Persen supply yang dipegang anggota klaster. */
  sharePct: number;
  /** Nilai USD pendanaan native coin yang diterima anggota, dari wallet mana pun. */
  fundingUsd: number;
  /** Jumlah garis yang kedua ujungnya anggota klaster ini. */
  internalLinkCount: number;
}

export interface MapSummary {
  walletCount: number;
  holderCount: number;
  clusterCount: number;
  linkCount: number;
  /** Persen supply di semua klaster. */
  clusteredSharePct: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Luas gelembung sebanding dengan porsi supply, jadi jari-jarinya pakai akar. */
export function bubbleRadius(sharePct: number, maxSharePct: number): number {
  if (sharePct <= 0 || maxSharePct <= 0) return LINK_ONLY_RADIUS;
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(Math.min(sharePct / maxSharePct, 1));
}

/** Warna klaster sesuai urutan; klaster ke-4 dst. tidak diberi warna sendiri. */
export function clusterStyles(map: WalletMap): ClusterStyle[] {
  return map.clusters.map((cluster, index) => {
    const members = map.nodes.filter((node) => node.clusterId === cluster.id);
    const keys = new Set(members.map((node) => addressKey(map.chain, node.address)));
    const isMember = (address: string) => keys.has(addressKey(map.chain, address));
    return {
      cluster,
      color: index < CLUSTER_COLORS.length ? CLUSTER_COLORS[index] : null,
      memberCount: members.length,
      sharePct: round2(members.reduce((sum, node) => sum + node.sharePct, 0)),
      fundingUsd: round2(
        map.edges
          .filter((edge) => edge.kind === "funding" && isMember(edge.to))
          .reduce((sum, edge) => sum + (edge.amountUsd ?? 0), 0),
      ),
      internalLinkCount: map.edges.filter((edge) => isMember(edge.from) && isMember(edge.to)).length,
    };
  });
}

export function nodeColor(node: MapNode, styles: ClusterStyle[]): string {
  const style = styles.find((item) => item.cluster.id === node.clusterId);
  return style?.color ?? NEUTRAL_NODE_COLOR;
}

export function summarizeMap(map: WalletMap): MapSummary {
  const clustered = map.nodes.filter((node) => node.clusterId);
  return {
    walletCount: map.nodes.length,
    holderCount: map.nodes.filter((node) => node.sharePct > 0).length,
    clusterCount: map.clusters.length,
    linkCount: map.edges.length,
    clusteredSharePct: round2(clustered.reduce((sum, node) => sum + node.sharePct, 0)),
  };
}

/** Garis yang menyentuh `address`, untuk panel detail wallet. */
export function edgesOf(chain: ChainId, edges: MapEdge[], address: string): MapEdge[] {
  const key = addressKey(chain, address);
  return edges.filter((edge) => addressKey(chain, edge.from) === key || addressKey(chain, edge.to) === key);
}

/** Wallet yang terhubung langsung dengan `address`. */
export function neighborsOf(chain: ChainId, edges: MapEdge[], address: string): Set<string> {
  const key = addressKey(chain, address);
  const result = new Set<string>();
  for (const edge of edgesOf(chain, edges, address)) {
    result.add(addressKey(chain, edge.from) === key ? edge.to : edge.from);
  }
  return result;
}

/**
 * Posisi gelembung di kanvas `MAP_WIDTH` × `MAP_HEIGHT`. Gelembung saling
 * tolak, garis menarik wallet yang terhubung, anggota klaster saling
 * mendekat, lalu tumpang tindih dibereskan di akhir.
 */
export function layoutWalletMap(map: WalletMap): PlacedNode[] {
  const maxShare = Math.max(...map.nodes.map((node) => node.sharePct), 0);
  const cx = MAP_WIDTH / 2;
  const cy = MAP_HEIGHT / 2;
  // Posisi awal: spiral dari tengah, holder terbesar paling dalam.
  const order = map.nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => b.node.sharePct - a.node.sharePct || a.index - b.index);
  const placed: PlacedNode[] = order.map(({ node }, rank) => {
    const angle = rank * 2.399963; // sudut emas
    const distance = 18 * Math.sqrt(rank + 1);
    return { node, x: cx + Math.cos(angle) * distance * 1.4, y: cy + Math.sin(angle) * distance, r: bubbleRadius(node.sharePct, maxShare) };
  });
  const index = new Map(placed.map((item, i) => [addressKey(map.chain, item.node.address), i]));
  const links = map.edges
    .map((edge) => [index.get(addressKey(map.chain, edge.from)), index.get(addressKey(map.chain, edge.to))])
    .filter((pair): pair is [number, number] => pair[0] !== undefined && pair[1] !== undefined && pair[0] !== pair[1]);

  for (let step = 0; step < ITERATIONS; step++) {
    const cooling = 1 - step / ITERATIONS;
    const fx = new Array(placed.length).fill(0);
    const fy = new Array(placed.length).fill(0);
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i];
      // Tarikan lembut ke tengah; kanvas lebih lebar dari tinggi.
      fx[i] += (cx - a.x) * 0.012;
      fy[i] += (cy - a.y) * 0.02;
      for (let j = i + 1; j < placed.length; j++) {
        const b = placed[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          dx = 0.01 * (j - i);
          dy = 0.01;
          dist = Math.hypot(dx, dy);
        }
        const want = a.r + b.r + NODE_GAP;
        const sameCluster = a.node.clusterId !== undefined && a.node.clusterId === b.node.clusterId;
        // Tolakan kuat bila bertumpuk, lemah bila jauh.
        let push = (want * want) / (dist * dist) * 2.2;
        if (sameCluster) push -= dist > want * 1.6 ? 0.9 : 0;
        const ux = dx / dist;
        const uy = dy / dist;
        fx[i] -= ux * push;
        fy[i] -= uy * push;
        fx[j] += ux * push;
        fy[j] += uy * push;
      }
    }
    for (const [i, j] of links) {
      const a = placed[i];
      const b = placed[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.hypot(dx, dy), 0.01);
      const pull = (dist - (a.r + b.r + 34)) * 0.03;
      fx[i] += (dx / dist) * pull;
      fy[i] += (dy / dist) * pull;
      fx[j] -= (dx / dist) * pull;
      fy[j] -= (dy / dist) * pull;
    }
    for (let i = 0; i < placed.length; i++) {
      const limit = 12 * cooling + 0.5;
      placed[i].x += Math.max(-limit, Math.min(limit, fx[i]));
      placed[i].y += Math.max(-limit, Math.min(limit, fy[i]));
    }
  }

  resolveOverlaps(placed);
  fitToCanvas(placed);
  return placed;
}

/** Margin kanvas supaya cincin seleksi dan tooltip tidak terpotong. */
const CANVAS_PADDING = 10;
/** Batas pembesaran jarak supaya peta kecil tidak tercerai-berai. */
const MAX_SPREAD = 2.4;

/**
 * Renggangkan jarak antar gelembung sampai peta memenuhi kanvas. Ukuran
 * gelembung tidak berubah, dan jarak hanya membesar, jadi tidak ada yang
 * menjadi bertumpuk.
 */
function fitToCanvas(placed: PlacedNode[]): void {
  if (placed.length < 2) return;
  // Geser kotak pembatas peta ke tengah kanvas dulu, baru direnggangkan dari tengah.
  const left = Math.min(...placed.map((item) => item.x - item.r));
  const right = Math.max(...placed.map((item) => item.x + item.r));
  const top = Math.min(...placed.map((item) => item.y - item.r));
  const bottom = Math.max(...placed.map((item) => item.y + item.r));
  const cx = MAP_WIDTH / 2;
  const cy = MAP_HEIGHT / 2;
  const shiftX = cx - (left + right) / 2;
  const shiftY = cy - (top + bottom) / 2;
  for (const item of placed) {
    item.x += shiftX;
    item.y += shiftY;
  }
  // Skala terbesar yang masih menjaga setiap gelembung di dalam kanvas.
  let scale = MAX_SPREAD;
  for (const item of placed) {
    const dx = item.x - cx;
    const dy = item.y - cy;
    if (dx > 0) scale = Math.min(scale, (MAP_WIDTH - CANVAS_PADDING - item.r - cx) / dx);
    if (dx < 0) scale = Math.min(scale, (CANVAS_PADDING + item.r - cx) / dx);
    if (dy > 0) scale = Math.min(scale, (MAP_HEIGHT - CANVAS_PADDING - item.r - cy) / dy);
    if (dy < 0) scale = Math.min(scale, (CANVAS_PADDING + item.r - cy) / dy);
  }
  if (scale <= 1) return;
  for (const item of placed) {
    item.x = cx + (item.x - cx) * scale;
    item.y = cy + (item.y - cy) * scale;
  }
}

/** Dorong gelembung yang masih bertumpuk dan jaga semuanya di dalam kanvas. */
function resolveOverlaps(placed: PlacedNode[]): void {
  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(Math.hypot(dx, dy), 0.01);
        const overlap = a.r + b.r + NODE_GAP - dist;
        if (overlap > 0) {
          const ux = dx / dist;
          const uy = dy / dist;
          a.x -= (ux * overlap) / 2;
          a.y -= (uy * overlap) / 2;
          b.x += (ux * overlap) / 2;
          b.y += (uy * overlap) / 2;
          moved = true;
        }
      }
    }
    for (const item of placed) {
      const margin = item.r + 4;
      item.x = Math.min(Math.max(item.x, margin), MAP_WIDTH - margin);
      item.y = Math.min(Math.max(item.y, margin), MAP_HEIGHT - margin);
    }
    if (!moved) return;
  }
}

/** Pilihan kedalaman penelusuran dari wallet pusat; `null` = semua lapis. */
export const LAYER_OPTIONS: ReadonlyArray<number | null> = [1, 2, 3, null];

/**
 * Jarak lapis setiap wallet dari wallet pusat lewat garis di peta (arah garis
 * diabaikan). Wallet yang tidak terjangkau dalam `maxDepth` lapis tidak ikut.
 */
export function layersFrom(
  chain: ChainId,
  edges: MapEdge[],
  center: string,
  maxDepth: number | null,
): Map<string, number> {
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    const set = adjacency.get(a) ?? new Set<string>();
    set.add(b);
    adjacency.set(a, set);
  };
  for (const edge of edges) {
    const from = addressKey(chain, edge.from);
    const to = addressKey(chain, edge.to);
    link(from, to);
    link(to, from);
  }
  const start = addressKey(chain, center);
  const depth = new Map([[start, 0]]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const next = depth.get(current)! + 1;
    if (maxDepth !== null && next > maxDepth) continue;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (depth.has(neighbor)) continue;
      depth.set(neighbor, next);
      queue.push(neighbor);
    }
  }
  return depth;
}

/** Baca `?lapis=` dari URL; nilai yang tidak dikenal berarti semua lapis. */
export function parseLayerParam(value: string | undefined): number | null {
  const parsed = Number(value);
  return LAYER_OPTIONS.includes(parsed) ? parsed : null;
}

type Point = [number, number];

/** Convex hull (monotone chain); titik dikembalikan berlawanan arah jarum jam. */
function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length <= 2) return sorted;
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Jarak area kelompok dari tepi gelembung anggotanya. */
const HULL_PADDING = 10;
const HULL_SAMPLES = 16;

/**
 * Area kelompok yang membungkus semua gelembung anggota, dengan jarak
 * `HULL_PADDING`. Dipakai sebagai penanda klaster di peta.
 */
export function clusterHull(members: Array<{ x: number; y: number; r: number }>): Point[] {
  const points: Point[] = [];
  for (const member of members) {
    const radius = member.r + HULL_PADDING;
    for (let i = 0; i < HULL_SAMPLES; i++) {
      const angle = (i / HULL_SAMPLES) * Math.PI * 2;
      points.push([member.x + Math.cos(angle) * radius, member.y + Math.sin(angle) * radius]);
    }
  }
  return convexHull(points);
}

/** Path SVG tertutup dari titik hull. */
export function hullPath(points: Point[]): string {
  if (points.length === 0) return "";
  return `M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`;
}

/** Posisi label kelompok: di atas titik tertinggi area, tetap di dalam kanvas. */
export function hullLabelPosition(points: Point[]): { x: number; y: number } {
  const top = points.reduce((best, point) => (point[1] < best[1] ? point : best), points[0]);
  return { x: Math.min(Math.max(top[0], 60), MAP_WIDTH - 60), y: Math.max(top[1] - 6, 12) };
}
