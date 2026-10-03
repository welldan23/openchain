/** Utilitas kecil untuk CLI: argumen dan format angka gaya Indonesia. */
import type { DataStatus } from '../database/schema/enums.js';

export interface CliArgs {
  positional: string[];
  flags: Set<string>;
}

/** Pisahkan argumen biasa dan flag `--nama`. */
export function parseArgs(argv: string[]): CliArgs {
  const positional: string[] = [];
  const flags = new Set<string>();
  for (const arg of argv) {
    if (arg.startsWith('--')) flags.add(arg.slice(2));
    else positional.push(arg);
  }
  return { positional, flags };
}

/** Bilangan bulat dengan pemisah ribuan titik, mis. 78.912.345. */
export function formatInteger(value: number | bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Desimal dari string (mis. hasil formatUnits) dengan koma, maksimal `maxFraction` angka. */
export function formatDecimal(value: string, maxFraction = 4): string {
  const [whole, fraction = ''] = value.split('.');
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, '');
  return trimmed ? `${formatInteger(BigInt(whole))},${trimmed}` : formatInteger(BigInt(whole));
}

export const STATUS_ICON: Record<DataStatus, string> = {
  complete: '✓',
  partial: '!',
  stale: '!',
  unavailable: '✗',
};

/** Rata kiri dengan lebar tetap untuk kolom tabel sederhana. */
export function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}
