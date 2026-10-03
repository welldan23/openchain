/**
 * Logika halaman Jelajah Multichain: merangkum aktivitas satu address di
 * beberapa chain dan perpindahan dananya lewat bridge.
 */
import type { ChainActivity, ChainId, MultichainProfile } from "./types";

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
