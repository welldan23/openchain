/**
 * Ubah jumlah mentah (satuan terkecil, mis. wei) menjadi string desimal
 * memakai BigInt, supaya angka uint256 tidak kehilangan presisi.
 * Contoh: formatUnits('1500000000000000000', 18) → '1.5'.
 */
export function formatUnits(raw: string, decimals: number): string {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Jumlah mentah harus bilangan bulat non-negatif: "${raw}"`);
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`Decimals tidak valid: ${decimals}`);
  }
  const value = BigInt(raw);
  if (decimals === 0) return value.toString();
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Kolom numeric PostgreSQL datang sebagai string; ubah ke number bila ada. */
export function numericToNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
