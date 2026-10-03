/**
 * Logika halaman Jelajah Multichain: merangkum aktivitas satu address di
 * beberapa chain dan perpindahan dananya lewat bridge.
 */
import { wibDateValue } from "./flow-filter";
import type { ChainActivity, ChainId, CrossChainActivity, MultichainProfile } from "./types";

export interface MultichainSummary {
  activeChains: ChainId[];
  inactiveChains: ChainId[];
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

export function isActive(activity: ChainActivity): boolean {
  return activity.txCount > 0;
}

export function summarizeMultichain(profile: MultichainProfile): MultichainSummary {
  const active = profile.chains.filter(isActive);
  const busiest = [...active].sort((a, b) => b.txCount - a.txCount || a.chain.localeCompare(b.chain))[0];
  return {
    activeChains: active.map((item) => item.chain),
    inactiveChains: profile.chains.filter((item) => !isActive(item)).map((item) => item.chain),
    totalTx: active.reduce((sum, item) => sum + item.txCount, 0),
    inUsd: round2(active.reduce((sum, item) => sum + item.inUsd, 0)),
    outUsd: round2(active.reduce((sum, item) => sum + item.outUsd, 0)),
    balanceUsd: round2(profile.chains.reduce((sum, item) => sum + item.balanceUsd, 0)),
    busiestChain: busiest?.chain ?? null,
    bridgeCount: profile.bridges.length,
    bridgedUsd: round2(profile.bridges.reduce((sum, item) => sum + (item.amountUsd ?? 0), 0)),
    unmatchedBridges: profile.bridges.filter((item) => item.status !== "matched").length,
  };
}

/** Chain aktif dulu (transaksi terbanyak di atas), lalu yang tidak aktif. */
export function sortChainActivity(chains: ChainActivity[]): ChainActivity[] {
  return [...chains].sort(
    (a, b) => Number(isActive(b)) - Number(isActive(a)) || b.txCount - a.txCount || a.chain.localeCompare(b.chain),
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
