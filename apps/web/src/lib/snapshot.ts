/**
 * Utilitas tampilan snapshot data. Snapshot mencatat kapan dan pada blok/slot
 * berapa data diambil, supaya investigasi bisa dibuka ulang dengan hasil yang
 * sama (reproducibility).
 */
import { getChain } from "./chains";
import { EMPTY_VALUE, formatDateTime, formatNumber, formatRelativeTime } from "./format";
import type { ChainId, DataSnapshot } from "./types";

export interface SnapshotDescription {
  /** "03 Okt 2026, 11.30 WIB" */
  fetchedAt: string;
  /** "1 jam yang lalu" — relatif terhadap `now`. */
  fetchedAgo: string;
  /** "Blok 23.512.880" (EVM) atau "Slot 371.204.551" (Solana). */
  position: string;
  /** "Node RPC, DEX indexer" */
  sources: string;
}

/** EVM memakai nomor blok, Solana memakai nomor slot. */
export function snapshotPositionLabel(chain: ChainId): "Blok" | "Slot" {
  return getChain(chain).addressFormat === "solana" ? "Slot" : "Blok";
}

export function describeSnapshot(
  snapshot: DataSnapshot,
  chain: ChainId,
  now: Date = new Date(),
): SnapshotDescription {
  return {
    fetchedAt: formatDateTime(snapshot.fetchedAt),
    fetchedAgo: formatRelativeTime(snapshot.fetchedAt, now),
    position: `${snapshotPositionLabel(chain)} ${formatNumber(snapshot.blockNumber)}`,
    sources: snapshot.sources.length > 0 ? snapshot.sources.join(", ") : EMPTY_VALUE,
  };
}
