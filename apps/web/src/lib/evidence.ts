/**
 * Bukti transaksi untuk modal "Bukti hash": dikumpulkan per hash transaksi,
 * dan bisa dibuka langsung lewat tautan `#bukti-<hash>`.
 */
import type { ChainId, EntityLabel, FlowTransfer, TraceHop, TxEvidence } from "./types";

const ANCHOR_PREFIX = "bukti-";
/** Hash EVM (0x + 64 hex) atau signature Solana (base58). */
const TX_HASH_PATTERN = /^(0x[0-9a-fA-F]{64}|[1-9A-HJ-NP-Za-km-z]{64,90})$/;

export function evidenceAnchor(txHash: string): string {
  return `${ANCHOR_PREFIX}${txHash}`;
}

/** Hash transaksi dari fragmen URL, mis. `#bukti-0xabc…`; `null` bila bukan tautan bukti. */
export function parseEvidenceAnchor(fragment: string): string | null {
  const value = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (!value.startsWith(ANCHOR_PREFIX)) return null;
  const txHash = decodeURIComponent(value.slice(ANCHOR_PREFIX.length));
  return TX_HASH_PATTERN.test(txHash) ? txHash : null;
}

/** Tautan halaman ini yang langsung membuka bukti `txHash`. */
export function evidenceLink(pageUrl: string, txHash: string): string {
  return `${pageUrl.split("#")[0]}#${evidenceAnchor(txHash)}`;
}

function addMovement(map: Map<string, TxEvidence>, chain: ChainId, txHash: string, timestamp: string, movement: TxEvidence["movements"][number]) {
  const evidence = map.get(txHash) ?? { chain, txHash, timestamp, movements: [] };
  evidence.movements.push(movement);
  map.set(txHash, evidence);
}

/**
 * Bukti dari transfer halaman aliran dana. Transfer dengan hash yang sama
 * (mis. tambah likuiditas yang memindahkan ETH dan token) jadi satu bukti.
 */
export function evidenceFromTransfers(
  chain: ChainId,
  owner: { address: string; label?: EntityLabel },
  transfers: FlowTransfer[],
): TxEvidence[] {
  const map = new Map<string, TxEvidence>();
  for (const transfer of transfers) {
    const other = { address: transfer.counterparty, label: transfer.counterpartyLabel };
    const [from, to] = transfer.direction === "in" ? [other, owner] : [owner, other];
    addMovement(map, chain, transfer.txHash, transfer.timestamp, {
      from: from.address,
      fromLabel: from.label,
      to: to.address,
      toLabel: to.label,
      asset: transfer.asset,
      amount: transfer.amount,
      amountUsd: transfer.amountUsd,
    });
  }
  return [...map.values()];
}

/** Bukti dari langkah-langkah jalur telusur antar wallet. */
export function evidenceFromHops(chain: ChainId, hops: TraceHop[]): TxEvidence[] {
  const map = new Map<string, TxEvidence>();
  for (const hop of hops) {
    const { txHash, timestamp, ...movement } = hop;
    addMovement(map, chain, txHash, timestamp, movement);
  }
  return [...map.values()];
}
