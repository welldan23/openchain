/**
 * Normalisasi identifier on-chain per keluarga chain.
 *
 * Address EVM tidak case-sensitive, jadi bentuk ternormalisasinya huruf kecil.
 * Address dan signature Solana case-sensitive, jadi tidak diubah. Identifier
 * asli tetap disimpan apa adanya di kolom `address`.
 */
import { createHash } from 'node:crypto';
import type { ChainFamily, InfoClassification } from './schema/enums.js';

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EVM_TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

export class InvalidIdentifierError extends Error {
  constructor(kind: 'address' | 'hash transaksi', family: ChainFamily, value: string) {
    super(`Format ${kind} ${family} tidak valid: "${value}"`);
    this.name = 'InvalidIdentifierError';
  }
}

/** Bentuk ternormalisasi address untuk pencegahan duplikat. */
export function normalizeAddress(family: ChainFamily, raw: string): string {
  const value = raw.trim();
  switch (family) {
    case 'evm':
      if (!EVM_ADDRESS.test(value)) throw new InvalidIdentifierError('address', family, raw);
      return value.toLowerCase();
    case 'solana':
      if (!BASE58_ADDRESS.test(value)) throw new InvalidIdentifierError('address', family, raw);
      return value;
    default:
      // Aturan Bitcoin, Tron, dan TON ditetapkan saat adapternya dibuat (fase 4).
      if (value === '') throw new InvalidIdentifierError('address', family, raw);
      return value;
  }
}

/** Bentuk ternormalisasi hash transaksi (EVM) atau signature (Solana). */
export function normalizeTxHash(family: ChainFamily, raw: string): string {
  const value = raw.trim();
  switch (family) {
    case 'evm':
      if (!EVM_TX_HASH.test(value)) throw new InvalidIdentifierError('hash transaksi', family, raw);
      return value.toLowerCase();
    case 'solana':
      if (!BASE58_SIGNATURE.test(value)) throw new InvalidIdentifierError('hash transaksi', family, raw);
      return value;
    default:
      if (value === '') throw new InvalidIdentifierError('hash transaksi', family, raw);
      return value;
  }
}

export interface NormalizedAddress {
  /** Identifier asli seperti yang pertama kali dimasukkan (sudah di-trim). */
  address: string;
  normalized: string;
}

export interface DedupeResult {
  addresses: NormalizedAddress[];
  /** Input yang dibuang karena sama dengan address sebelumnya. */
  duplicates: string[];
  /** Input yang formatnya tidak valid; dilaporkan, tidak diam-diam dibuang. */
  invalid: string[];
}

/**
 * Buang address duplikat secara deterministik: untuk input yang sama hasilnya
 * selalu sama, kemunculan pertama yang dipertahankan, dan identifier aslinya
 * tidak diubah.
 */
export function dedupeAddresses(family: ChainFamily, inputs: string[]): DedupeResult {
  const kept = new Map<string, string>();
  const duplicates: string[] = [];
  const invalid: string[] = [];
  for (const input of inputs) {
    let normalized: string;
    try {
      normalized = normalizeAddress(family, input);
    } catch {
      invalid.push(input);
      continue;
    }
    if (kept.has(normalized)) duplicates.push(input);
    else kept.set(normalized, input.trim());
  }
  return {
    addresses: [...kept].map(([normalized, address]) => ({ address, normalized })),
    duplicates,
    invalid,
  };
}

export interface EvidenceKeyParts {
  chainId: string;
  classification: InfoClassification;
  /** Hash transaksi yang sudah dinormalisasi lewat `normalizeTxHash`. */
  txHash?: string | null;
  logIndex?: number | null;
  heuristicName?: string | null;
  /** Hal yang dibuktikan, mis. id temuan atau pasangan address. */
  subject?: string | null;
}

/**
 * Kunci deterministik sebuah bukti. Bukti yang sama selalu menghasilkan kunci
 * yang sama, sehingga penyimpanan ulang tidak membuat baris ganda.
 */
export function buildEvidenceKey(parts: EvidenceKeyParts): string {
  const canonical = [
    parts.chainId,
    parts.classification,
    parts.txHash ?? '',
    parts.logIndex ?? '',
    parts.heuristicName ?? '',
    parts.subject ?? '',
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}
