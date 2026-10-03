/**
 * Logika halaman Jelajah Multichain: merangkum aktivitas satu address di
 * beberapa chain dan perpindahan dananya lewat bridge.
 */
import { wibDateValue } from "./flow-filter";
import type { BridgeMove, ChainActivity, ChainId, CrossChainActivity, EntityLabel, MultichainProfile } from "./types";

export interface MultichainSummary {
  activeChains: ChainId[];
  /** Chain yang datanya lengkap tapi tidak ada aktivitas. */
  inactiveChains: ChainId[];
  /** Chain yang gagal dimuat; aktivitasnya tidak diketahui dan tidak ikut dijumlahkan. */
  unavailableChains: ChainId[];
  /** Chain yang datanya tertinggal dari snapshot chain lain. */
  staleChains: ChainId[];
  totalTx: number;
  inUsd: number;
  outUsd: number;
  balanceUsd: number;
  /** Chain dengan transaksi terbanyak; `null` bila tidak aktif di mana pun. */
  busiestChain: ChainId | null;
  bridgeCount: number;
  bridgedUsd: number;
  /** Kiriman bridge yang belum ketemu pasangannya di chain tujuan. */
  unmatchedBridges: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Aktif = datanya ada dan punya transaksi. Chain yang gagal dimuat tidak dianggap aktif maupun tidak aktif. */
export function isActive(activity: ChainActivity): boolean {
  return activity.status !== "unavailable" && activity.txCount > 0;
}

function isUnavailable(activity: ChainActivity): boolean {
  return activity.status === "unavailable";
}

export function summarizeMultichain(profile: MultichainProfile): MultichainSummary {
  const active = profile.chains.filter(isActive);
  const busiest = [...active].sort((a, b) => b.txCount - a.txCount || a.chain.localeCompare(b.chain))[0];
  return {
    activeChains: active.map((item) => item.chain),
    inactiveChains: profile.chains.filter((item) => !isActive(item) && !isUnavailable(item)).map((item) => item.chain),
    unavailableChains: profile.chains.filter(isUnavailable).map((item) => item.chain),
    staleChains: profile.chains.filter((item) => item.status === "stale").map((item) => item.chain),
    totalTx: active.reduce((sum, item) => sum + item.txCount, 0),
    inUsd: round2(active.reduce((sum, item) => sum + item.inUsd, 0)),
    outUsd: round2(active.reduce((sum, item) => sum + item.outUsd, 0)),
    balanceUsd: round2(profile.chains.filter((item) => !isUnavailable(item)).reduce((sum, item) => sum + item.balanceUsd, 0)),
    busiestChain: busiest?.chain ?? null,
    bridgeCount: profile.bridges.length,
    bridgedUsd: round2(profile.bridges.reduce((sum, item) => sum + (item.amountUsd ?? 0), 0)),
    unmatchedBridges: profile.bridges.filter((item) => item.status !== "matched").length,
  };
}

/** Urutan kelompok: aktif, tidak aktif, lalu gagal dimuat. */
function statusRank(activity: { active: boolean; status: ChainActivity["status"] }): number {
  if (activity.status === "unavailable") return 2;
  return activity.active ? 0 : 1;
}

/** Chain aktif dulu (transaksi terbanyak di atas), lalu yang tidak aktif, lalu yang gagal dimuat. */
export function sortChainActivity(chains: ChainActivity[]): ChainActivity[] {
  return [...chains].sort(
    (a, b) =>
      statusRank({ active: isActive(a), status: a.status }) - statusRank({ active: isActive(b), status: b.status }) ||
      b.txCount - a.txCount ||
      a.chain.localeCompare(b.chain),
  );
}

/** Biaya atau selisih bridge dalam persen dari jumlah yang dikirim; `null` bila belum diterima. */
export function bridgeFeePct(amountSent: number, amountReceived: number | undefined): number | null {
  if (amountReceived === undefined || amountSent <= 0) return null;
  return Math.round(((amountSent - amountReceived) / amountSent) * 10_000) / 100;
}

/** Address EVM: 0x + 40 hex. Jelajah multichain hanya untuk address EVM. */
export function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * Chain terpilih dari `?jaringan=ethereum,base`. Nilai asing diabaikan;
 * kosong atau tidak ada yang valid berarti semua chain.
 */
export function parseChainSelection(value: string | undefined, available: ChainId[]): ChainId[] {
  const picked = new Set((value ?? "").split(",").map((item) => item.trim()));
  const selected = available.filter((chain) => picked.has(chain));
  return selected.length > 0 ? selected : [...available];
}

/** Nilai `?jaringan=`; `undefined` bila semua chain terpilih supaya URL tetap pendek. */
export function serializeChainSelection(selected: ChainId[], available: ChainId[]): string | undefined {
  const set = new Set(selected);
  const ordered = available.filter((chain) => set.has(chain));
  return ordered.length === 0 || ordered.length === available.length ? undefined : ordered.join(",");
}

/** Profil yang hanya memuat chain terpilih, dan bridge yang menyentuh salah satunya. */
export function filterProfileChains(profile: MultichainProfile, selected: ChainId[]): MultichainProfile {
  const set = new Set(selected);
  return {
    ...profile,
    chains: profile.chains.filter((item) => set.has(item.chain)),
    bridges: profile.bridges.filter((move) => set.has(move.fromChain) || set.has(move.toChain)),
    activities: profile.activities.filter((item) => set.has(item.chain)),
  };
}

/** Tab linimasa: semua, dana masuk, dana keluar, atau kaki bridge. */
export type ActivityFilter = "all" | "in" | "out" | "bridge";

export function matchesActivityFilter(activity: CrossChainActivity, filter: ActivityFilter): boolean {
  if (filter === "all") return true;
  if (filter === "bridge") return activity.kind === "bridge_in" || activity.kind === "bridge_out";
  return activity.kind === filter;
}

/** Linimasa per hari (tanggal WIB), hari dan aktivitas terbaru di atas. */
export function groupActivitiesByDay(activities: CrossChainActivity[]): Array<{ day: string; items: CrossChainActivity[] }> {
  const sorted = [...activities].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id));
  const groups: Array<{ day: string; items: CrossChainActivity[] }> = [];
  for (const activity of sorted) {
    const day = wibDateValue(activity.timestamp);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(activity);
    else groups.push({ day, items: [activity] });
  }
  return groups;
}

/** Satu baris tabel perbandingan antar chain. */
export interface ComparisonRow {
  chain: ChainId;
  active: boolean;
  status: ChainActivity["status"];
  txCount: number;
  /** Porsi transaksi chain ini dari total semua chain terpilih, dalam persen. */
  txSharePct: number;
  inUsd: number;
  outUsd: number;
  netUsd: number;
  counterpartyCount: number;
  balanceUsd: number;
  firstSeen?: string;
  lastSeen?: string;
  bridgesOut: number;
  bridgesIn: number;
}

export type ComparisonKey =
  | "chain"
  | "txCount"
  | "inUsd"
  | "outUsd"
  | "netUsd"
  | "counterpartyCount"
  | "balanceUsd"
  | "firstSeen"
  | "lastSeen";

export function comparisonRows(profile: MultichainProfile): ComparisonRow[] {
  const totalTx = profile.chains.filter(isActive).reduce((sum, item) => sum + item.txCount, 0);
  return profile.chains.map((item) => ({
    chain: item.chain,
    active: isActive(item),
    status: item.status,
    txCount: item.txCount,
    txSharePct: totalTx > 0 && isActive(item) ? round2((item.txCount / totalTx) * 100) : 0,
    inUsd: item.inUsd,
    outUsd: item.outUsd,
    netUsd: round2(item.inUsd - item.outUsd),
    counterpartyCount: item.counterpartyCount,
    balanceUsd: item.balanceUsd,
    firstSeen: item.firstSeen,
    lastSeen: item.lastSeen,
    bridgesOut: profile.bridges.filter((move) => move.fromChain === item.chain).length,
    bridgesIn: profile.bridges.filter((move) => move.toChain === item.chain && move.status === "matched").length,
  }));
}

function sortValue(row: ComparisonRow, key: ComparisonKey): number | string {
  if (key === "chain") return row.chain;
  if (key === "firstSeen" || key === "lastSeen") return row[key] ? Date.parse(row[key]) : 0;
  return row[key];
}

/** Urutkan tabel; chain tidak aktif dan yang gagal dimuat selalu di bawah apa pun urutannya. */
export function sortComparison(rows: ComparisonRow[], key: ComparisonKey, direction: "asc" | "desc"): ComparisonRow[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const rank = statusRank(a) - statusRank(b);
    if (rank !== 0) return rank;
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    const diff = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
    return diff * sign || a.chain.localeCompare(b.chain);
  });
}

/** Chain dengan nilai tertinggi per kolom angka (hanya chain aktif); `null` bila semua nol. */
export function columnLeaders(rows: ComparisonRow[]): Partial<Record<ComparisonKey, ChainId>> {
  const keys: ComparisonKey[] = ["txCount", "inUsd", "outUsd", "netUsd", "counterpartyCount", "balanceUsd"];
  const leaders: Partial<Record<ComparisonKey, ChainId>> = {};
  for (const key of keys) {
    const best = rows
      .filter((row) => row.active)
      .reduce<ComparisonRow | null>((top, row) => (top === null || (row[key] as number) > (top[key] as number) ? row : top), null);
    if (best && (best[key] as number) > 0) leaders[key] = best.chain;
  }
  return leaders;
}

/** Jenis infrastruktur yang dikumpulkan panel jembatan & router. */
export type InfrastructureType = "bridge" | "router";

export interface DetectedInfrastructure {
  /** Kunci pengelompokan: jenis + nama label. */
  key: string;
  type: InfrastructureType;
  label: EntityLabel;
  chains: ChainId[];
  /** Address infrastruktur per chain; satu bridge bisa punya address berbeda di tiap chain. */
  addresses: Array<{ chain: ChainId; address: string }>;
  interactions: number;
  totalUsd: number;
  lastAt: string;
}

/**
 * Bridge dan router yang pernah menjadi lawan transaksi, dikelompokkan per
 * nama label lintas chain. Terbesar (nilai USD) dulu.
 */
export function detectInfrastructure(activities: CrossChainActivity[]): DetectedInfrastructure[] {
  const groups = new Map<string, DetectedInfrastructure>();
  for (const activity of activities) {
    const label = activity.counterpartyLabel;
    if (!label || (label.type !== "bridge" && label.type !== "router")) continue;
    const key = `${label.type}:${label.name ?? label.type}`;
    const group = groups.get(key) ?? {
      key,
      type: label.type,
      label,
      chains: [],
      addresses: [],
      interactions: 0,
      totalUsd: 0,
      lastAt: activity.timestamp,
    };
    group.interactions += 1;
    group.totalUsd = round2(group.totalUsd + (activity.amountUsd ?? 0));
    if (!group.chains.includes(activity.chain)) group.chains.push(activity.chain);
    if (!group.addresses.some((item) => item.chain === activity.chain && item.address === activity.counterparty)) {
      group.addresses.push({ chain: activity.chain, address: activity.counterparty });
    }
    if (Date.parse(activity.timestamp) > Date.parse(group.lastAt)) group.lastAt = activity.timestamp;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.totalUsd - a.totalUsd || a.key.localeCompare(b.key));
}

/** Satu alasan pencocokan kiriman dan penerimaan bridge. */
export interface BridgeMatchCheck {
  id: "asset" | "amount" | "timing";
  label: string;
  detail: string;
  /** `null` bila belum bisa dicek, mis. penerimaan belum ditemukan. */
  passed: boolean | null;
}

/** Selisih jumlah yang masih wajar sebagai biaya bridge. */
const MAX_BRIDGE_FEE_PCT = 1;
/** Jeda terlama yang masih wajar antara kiriman dan penerimaan. */
const MAX_BRIDGE_DELAY_MS = 24 * 60 * 60 * 1000;

function describeDelay(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} jam` : `${Math.round(hours / 24)} hari`;
}

/**
 * Alasan kiriman di chain asal dianggap pasangan penerimaan di chain tujuan.
 * Aset dan jumlah baru bisa dicek bila penerimaan sudah ditemukan; tanpa itu
 * hanya lama menunggu yang bisa dinilai.
 */
export function bridgeMatchChecks(move: BridgeMove, now: string): BridgeMatchCheck[] {
  if (move.amountReceived === undefined || !move.receivedAt) {
    // Tanpa penerimaan, belum ada sisi kedua untuk dibandingkan.
    const asset: BridgeMatchCheck = {
      id: "asset",
      label: "Aset sama",
      detail: `Dikirim dalam ${move.asset.symbol}; sisi penerima belum ditemukan.`,
      passed: null,
    };
    const waited = Date.parse(now) - Date.parse(move.sentAt);
    const late = waited > MAX_BRIDGE_DELAY_MS;
    return [
      asset,
      { id: "amount", label: "Jumlah cocok", detail: "Belum bisa dicek, penerimaan belum ditemukan.", passed: null },
      {
        id: "timing",
        label: "Waktu wajar",
        detail: late
          ? `Sudah ${describeDelay(waited)} sejak dikirim tanpa penerimaan yang cocok; biasanya kurang dari 24 jam.`
          : `Baru ${describeDelay(waited)} sejak dikirim; penerimaan bisa belum terjadi.`,
        passed: late ? false : null,
      },
    ];
  }
  const asset: BridgeMatchCheck = {
    id: "asset",
    label: "Aset sama",
    detail: `${move.asset.symbol} di kedua sisi.`,
    passed: true,
  };
  const fee = bridgeFeePct(move.amountSent, move.amountReceived) ?? 0;
  const delay = Date.parse(move.receivedAt) - Date.parse(move.sentAt);
  return [
    asset,
    {
      id: "amount",
      label: "Jumlah cocok",
      detail:
        fee === 0
          ? "Jumlah diterima sama persis dengan yang dikirim."
          : `Selisih ${String(fee).replace(".", ",")}%, ${fee <= MAX_BRIDGE_FEE_PCT ? "wajar untuk biaya bridge" : "lebih besar dari biaya bridge yang biasa"}.`,
      passed: fee >= 0 && fee <= MAX_BRIDGE_FEE_PCT,
    },
    {
      id: "timing",
      label: "Waktu wajar",
      detail: `Diterima ${describeDelay(delay)} setelah dikirim.`,
      passed: delay >= 0 && delay <= MAX_BRIDGE_DELAY_MS,
    },
  ];
}

export function bridgeEvidenceAnchor(id: string): string {
  return `bukti-bridge-${id}`;
}

/** Tampilan halaman: bandingkan beberapa jaringan, atau fokus ke satu jaringan. */
export type MultichainViewMode = "compare" | "single";

/** `?tampilan=satu` untuk satu chain; selain itu perbandingan. */
export function parseViewMode(value: string | undefined): MultichainViewMode {
  return value === "satu" ? "single" : "compare";
}

/**
 * Jaringan untuk tampilan satu chain: yang pertama dari pilihan bila
 * pilihannya satu, selain itu chain aktif tersibuk di antara pilihan,
 * lalu chain pertama yang datanya tersedia.
 */
export function pickSingleChain(chains: ChainActivity[], selected: ChainId[]): ChainId | null {
  const pool = chains.filter((item) => selected.includes(item.chain));
  if (pool.length === 1) return pool[0].chain;
  const busiest = sortChainActivity(pool).find(isActive);
  return busiest?.chain ?? pool.find((item) => item.status !== "unavailable")?.chain ?? pool[0]?.chain ?? null;
}
