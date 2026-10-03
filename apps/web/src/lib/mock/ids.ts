/**
 * Generator address & hash tiruan yang deterministik: seed yang sama selalu
 * menghasilkan nilai yang sama, jadi data tiruan stabil di setiap render.
 * Nilai ini fiktif dan tidak merujuk ke address/transaksi nyata.
 */

const HEX = "0123456789abcdef";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** PRNG kecil (xmur3 + mulberry32) yang di-seed dari string. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomString(seed: string, alphabet: string, length: number): string {
  const next = seededRandom(seed);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(next() * alphabet.length)];
  }
  return out;
}

/** Address EVM tiruan: 0x + 40 hex. */
export function mockEvmAddress(seed: string): string {
  return `0x${randomString(`evm-addr:${seed}`, HEX, 40)}`;
}

/** Hash transaksi EVM tiruan: 0x + 64 hex. */
export function mockEvmTxHash(seed: string): string {
  return `0x${randomString(`evm-tx:${seed}`, HEX, 64)}`;
}

/** Address Solana tiruan: base58, 44 karakter. */
export function mockSolanaAddress(seed: string): string {
  return randomString(`sol-addr:${seed}`, BASE58, 44);
}

/** Signature transaksi Solana tiruan: base58, 88 karakter. */
export function mockSolanaSignature(seed: string): string {
  return randomString(`sol-tx:${seed}`, BASE58, 88);
}
