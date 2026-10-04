/**
 * Alasan sebuah kiriman bridge dianggap pasangan penerimaan di chain lain,
 * dengan patokan yang sama seperti pencocokan: aset sama, selisih jumlah
 * ≤1% dan tidak lebih besar, diterima 0–24 jam sesudahnya. Tanpa kaki
 * terima, aset dan jumlah belum bisa dicek (`passed: null`).
 */
import { MAX_BRIDGE_DELAY_MS, MAX_BRIDGE_FEE_BPS } from './bridge-matching.js';

export interface BridgeCheck {
  id: 'asset' | 'amount' | 'timing';
  label: string;
  detail: string;
  /** `null` bila belum bisa dicek. */
  passed: boolean | null;
}

export interface BridgeLeg {
  /** Kunci aset (lihat `assetKey`); `null` bila tidak bisa dibandingkan. */
  asset: string | null;
  symbol: string;
  amountRaw: string;
  at: Date;
}

function describeDelay(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} jam` : `${Math.round(hours / 24)} hari`;
}

export function bridgeChecks(sent: BridgeLeg, received: BridgeLeg | null, now: Date): BridgeCheck[] {
  if (!received) {
    const waited = now.getTime() - sent.at.getTime();
    const late = waited > MAX_BRIDGE_DELAY_MS;
    return [
      { id: 'asset', label: 'Aset sama', detail: `Dikirim dalam ${sent.symbol}; sisi penerima belum ditemukan.`, passed: null },
      { id: 'amount', label: 'Jumlah cocok', detail: 'Belum bisa dicek, penerimaan belum ditemukan.', passed: null },
      {
        id: 'timing',
        label: 'Waktu wajar',
        detail: late
          ? `Sudah ${describeDelay(waited)} sejak dikirim tanpa penerimaan yang cocok; biasanya kurang dari 24 jam.`
          : `Baru ${describeDelay(waited)} sejak dikirim; penerimaan bisa belum terjadi.`,
        passed: late ? false : null,
      },
    ];
  }
  const sameAsset = sent.asset !== null && sent.asset === received.asset;
  const sentRaw = BigInt(sent.amountRaw);
  const receivedRaw = BigInt(received.amountRaw);
  const bps = sentRaw > 0n ? ((sentRaw - receivedRaw) * 10_000n) / sentRaw : null;
  const delay = received.at.getTime() - sent.at.getTime();
  const pct = bps === null ? null : (Number(bps) / 100).toLocaleString('id-ID', { maximumFractionDigits: 2 });
  return [
    {
      id: 'asset',
      label: 'Aset sama',
      detail: sameAsset ? `${sent.symbol} di kedua sisi.` : `Dikirim ${sent.symbol}, diterima ${received.symbol}.`,
      passed: sameAsset,
    },
    {
      id: 'amount',
      label: 'Jumlah cocok',
      detail:
        bps === null
          ? 'Jumlah dikirim tidak valid.'
          : bps === 0n
            ? 'Jumlah diterima sama persis dengan yang dikirim.'
            : bps < 0n
              ? 'Jumlah diterima lebih besar dari yang dikirim.'
              : `Selisih ${pct}%, ${bps <= MAX_BRIDGE_FEE_BPS ? 'wajar untuk biaya bridge' : 'lebih besar dari biaya bridge yang biasa'}.`,
      passed: bps !== null && bps >= 0n && bps <= MAX_BRIDGE_FEE_BPS,
    },
    {
      id: 'timing',
      label: 'Waktu wajar',
      detail: delay < 0 ? 'Diterima sebelum dikirim.' : `Diterima ${describeDelay(delay)} setelah dikirim.`,
      passed: delay >= 0 && delay <= MAX_BRIDGE_DELAY_MS,
    },
  ];
}
