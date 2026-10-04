/**
 * Pencocokan kiriman ke bridge dengan penerimaan di chain lain (heuristic
 * `openchain-bridge-match-v1`).
 *
 * Kandidat penerimaan: transfer masuk ke address yang sama di chain lain,
 * aset yang sama (native dengan simbol sama, atau token dengan simbol dan
 * desimal sama), diterima 0–24 jam sesudah dikirim, dan jumlahnya paling
 * banyak 1% lebih kecil (biaya bridge) dan tidak lebih besar dari yang
 * dikirim. Satu penerimaan hanya dipakai untuk satu kiriman.
 *
 * Hasilnya selalu dugaan: alamat yang sama di chain lain belum tentu orang
 * yang sama, dan penerimaan bisa datang dari sumber lain dengan jumlah mirip.
 */
import type { BridgeMatchStatus, ConfidenceLevel } from '../database/schema/enums.js';

export const BRIDGE_MATCH_HEURISTIC = 'openchain-bridge-match-v1';
export const MAX_BRIDGE_DELAY_MS = 24 * 60 * 60 * 1000;
/** Biaya bridge terbesar yang masih wajar, dalam basis poin (100 = 1%). */
export const MAX_BRIDGE_FEE_BPS = 100n;

/** Aset yang bisa dibandingkan lintas chain. */
export type AssetKey = string;

export interface BridgeSend {
  key: string;
  chainId: string;
  asset: AssetKey;
  amountRaw: string;
  sentAt: Date;
}

export interface BridgeReceipt {
  key: string;
  chainId: string;
  asset: AssetKey;
  amountRaw: string;
  receivedAt: Date;
}

export interface BridgeDecision {
  sendKey: string;
  status: BridgeMatchStatus;
  receipt: BridgeReceipt | null;
  confidence: ConfidenceLevel | null;
  reason: string;
}

/** Kunci aset: native per simbol, token per simbol dan desimal. */
export function assetKey(asset: { type: 'native'; symbol: string } | { type: 'token'; symbol: string | null; decimals: number | null }): AssetKey | null {
  if (asset.type === 'native') return `native:${asset.symbol.toUpperCase()}`;
  if (!asset.symbol || asset.decimals === null) return null;
  return `token:${asset.symbol.toUpperCase()}:${asset.decimals}`;
}

/** Biaya dalam basis poin; `null` bila diterima lebih banyak dari yang dikirim. */
function feeBps(sent: bigint, received: bigint): bigint | null {
  if (received > sent || sent === 0n) return null;
  return ((sent - received) * 10_000n) / sent;
}

function describeFee(bps: bigint): string {
  if (bps === 0n) return 'jumlah sama persis';
  const pct = Number(bps) / 100;
  return `selisih ${pct.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
}

function describeDelay(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} menit`;
  return `${Math.round(minutes / 60)} jam`;
}

/**
 * @param coveredUntil Waktu terakhir yang sudah terbaca di chain lain; kiriman
 *   lebih dari 24 jam sebelum waktu itu tanpa pasangan disebut `unmatched`.
 */
export function matchBridgeSends(sends: readonly BridgeSend[], receipts: readonly BridgeReceipt[], coveredUntil: Date | null): BridgeDecision[] {
  const used = new Set<string>();
  const ordered = [...sends].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime() || a.key.localeCompare(b.key));
  const decisions: BridgeDecision[] = [];
  for (const send of ordered) {
    const sent = BigInt(send.amountRaw);
    const candidates = receipts
      .filter((receipt) => !used.has(receipt.key) && receipt.chainId !== send.chainId && receipt.asset === send.asset)
      .map((receipt) => ({ receipt, delay: receipt.receivedAt.getTime() - send.sentAt.getTime(), fee: feeBps(sent, BigInt(receipt.amountRaw)) }))
      .filter((item) => item.delay >= 0 && item.delay <= MAX_BRIDGE_DELAY_MS && item.fee !== null && item.fee <= MAX_BRIDGE_FEE_BPS)
      .sort((a, b) => Number(a.fee! - b.fee!) || a.delay - b.delay || a.receipt.key.localeCompare(b.receipt.key));

    if (candidates.length === 0) {
      const late = coveredUntil !== null && coveredUntil.getTime() - send.sentAt.getTime() > MAX_BRIDGE_DELAY_MS;
      decisions.push({
        sendKey: send.key,
        status: late ? 'unmatched' : 'pending',
        receipt: null,
        confidence: null,
        reason: late
          ? 'Tidak ada penerimaan aset yang sama dengan selisih ≤1% dalam 24 jam di chain lain yang sudah dipindai.'
          : 'Penerimaan belum ditemukan; chain tujuan bisa belum dipindai atau penerimaannya belum terjadi.',
      });
      continue;
    }
    const best = candidates[0];
    used.add(best.receipt.key);
    const single = candidates.length === 1;
    const confidence: ConfidenceLevel = !single ? 'low' : best.fee! <= 50n && best.delay <= 60 * 60 * 1000 ? 'high' : 'medium';
    decisions.push({
      sendKey: send.key,
      status: 'matched',
      receipt: best.receipt,
      confidence,
      reason:
        `Penerimaan di ${best.receipt.chainId}: ${describeFee(best.fee!)}, ${describeDelay(best.delay)} setelah dikirim` +
        (single ? '.' : `; ada ${candidates.length} kandidat, dipilih yang selisihnya paling kecil.`),
    });
  }
  return decisions;
}

/** Nama protokol dari nama label, mis. "Across Protocol: Spoke Pool" → "Across Protocol". */
export function protocolFromLabel(name: string | null): { id: string; name: string } | null {
  if (!name) return null;
  const base = name.split(':')[0].trim();
  const id = base
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return id ? { id, name: base } : null;
}
