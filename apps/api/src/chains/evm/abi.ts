/**
 * Encode/decode ABI minimal untuk membaca token ERC-20 lewat `eth_call`.
 * Sengaja kecil dan tanpa dependency: yang dibutuhkan hanya beberapa fungsi
 * baca standar, dan library EVM lengkap ikut membawa fitur signing.
 */

/** Selector fungsi baca: 4 byte pertama keccak256 dari signature-nya. */
export const SELECTORS = {
  /** name() */
  name: '0x06fdde03',
  /** symbol() */
  symbol: '0x95d89b41',
  /** decimals() */
  decimals: '0x313ce567',
  /** totalSupply() */
  totalSupply: '0x18160ddd',
  /** balanceOf(address) */
  balanceOf: '0x70a08231',
  /** owner() */
  owner: '0x8da5cb5b',
} as const;

/** Slot storage EIP-1967: keccak256(label) dikurangi 1. */
export const EIP1967_SLOTS = {
  implementation: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
  beacon: '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50',
  admin: '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103',
} as const;

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Bytecode clone EIP-1167: prefix, address target 20 byte, lalu suffix. */
const MINIMAL_PROXY_PREFIX = '363d3d373d3d3d363d73';
const MINIMAL_PROXY_SUFFIX = '5af43d82803e903d91602b57fd5bf3';

/** Data hasil `eth_call` tidak sesuai bentuk ABI yang diharapkan. */
export class AbiDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbiDecodeError';
  }
}

function strip(hex: string): string {
  if (!/^0x([0-9a-fA-F]{2})*$/.test(hex)) throw new AbiDecodeError('Data bukan hex yang valid');
  return hex.slice(2).toLowerCase();
}

function word(data: string, index: number): string {
  const value = data.slice(index * 64, index * 64 + 64);
  if (value.length !== 64) throw new AbiDecodeError('Data ABI terlalu pendek');
  return value;
}

/** Argumen address untuk calldata (32 byte, rata kanan). */
export function encodeAddressArg(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new AbiDecodeError(`Address tidak valid: ${address}`);
  return address.slice(2).toLowerCase().padStart(64, '0');
}

/** `balanceOf(holder)` sebagai calldata. */
export function encodeBalanceOf(holder: string): string {
  return `${SELECTORS.balanceOf}${encodeAddressArg(holder)}`;
}

export function decodeUint256(hex: string): bigint {
  return BigInt(`0x${word(strip(hex), 0)}`);
}

/** Address dari word pertama; 12 byte teratas wajib nol. */
export function decodeAddress(hex: string): string {
  const value = word(strip(hex), 0);
  if (!/^0{24}/.test(value)) throw new AbiDecodeError('Word bukan address');
  return `0x${value.slice(24)}`;
}

/** Address di slot storage, atau `null` bila slotnya kosong. */
export function decodeSlotAddress(hex: string): string | null {
  // Sebagian node meringkas nilai slot (mis. `0x0`), jadi panjangnya tidak dipaksa genap.
  if (!/^0x[0-9a-fA-F]{0,64}$/.test(hex)) throw new AbiDecodeError('Nilai slot tidak valid');
  const value = hex.slice(2).toLowerCase().padStart(64, '0');
  if (/^0+$/.test(value)) return null;
  return decodeAddress(`0x${value}`);
}

/**
 * String ABI dinamis. Token lama (mis. MKR) mengembalikan `bytes32`, jadi
 * data tepat 32 byte dibaca sebagai teks rata kiri.
 */
export function decodeString(hex: string): string {
  const data = strip(hex);
  if (data.length === 64) return decodeBytes32String(data);

  const offset = Number(BigInt(`0x${word(data, 0)}`));
  if (!Number.isSafeInteger(offset) || offset % 32 !== 0) throw new AbiDecodeError('Offset string tidak valid');
  const length = Number(BigInt(`0x${word(data, offset / 32)}`));
  const start = offset * 2 + 64;
  if (!Number.isSafeInteger(length) || start + length * 2 > data.length) {
    throw new AbiDecodeError('Panjang string melebihi data');
  }
  return utf8(data.slice(start, start + length * 2));
}

function decodeBytes32String(data: string): string {
  const end = data.search(/(00)+$/);
  return utf8(end === -1 ? data : data.slice(0, end - (end % 2)));
}

function utf8(hexBytes: string): string {
  const bytes = Buffer.from(hexBytes, 'hex');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new AbiDecodeError('String bukan UTF-8 yang valid');
  }
  // Buang karakter kontrol (termasuk NUL) yang kadang dipakai sebagai padding.
  return [...text]
    .filter((char) => {
      const code = char.codePointAt(0)!;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .trim();
}

/** Target clone EIP-1167, atau `null` bila bytecode bukan clone standar. */
export function minimalProxyTarget(code: string): string | null {
  const data = strip(code);
  if (data.length !== MINIMAL_PROXY_PREFIX.length + 40 + MINIMAL_PROXY_SUFFIX.length) return null;
  if (!data.startsWith(MINIMAL_PROXY_PREFIX) || !data.endsWith(MINIMAL_PROXY_SUFFIX)) return null;
  return `0x${data.slice(MINIMAL_PROXY_PREFIX.length, MINIMAL_PROXY_PREFIX.length + 40)}`;
}

// ---------------------------------------------------------------------------
// Multicall3: banyak panggilan baca dalam satu `eth_call`, supaya hemat request
// dan tidak cepat kena batas rate RPC publik. Tetap read-only: kontrak hanya
// dijalankan lewat `eth_call`, tidak pernah lewat transaksi.
// ---------------------------------------------------------------------------

/** Address Multicall3 kanonik (sama di semua chain EVM yang didukung). */
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

/**
 * SHA-256 runtime bytecode Multicall3 kanonik. Sudah dicek identik di semua
 * chain adapter; kontrak dengan kode lain di address itu tidak dipercaya.
 */
export const MULTICALL3_CODE_SHA256 = '2756d7c52baee85cacb504f6ee1df7aad6809ac8d94a4a111d76991f90d36d6e';

/** aggregate3((address,bool,bytes)[]) */
const AGGREGATE3_SELECTOR = '0x82ad56cb';

function uintWord(value: bigint | number): string {
  return BigInt(value).toString(16).padStart(64, '0');
}

/** Baca satu word pada posisi byte tertentu sebagai angka aman. */
function numberAt(data: string, byteOffset: number): number {
  const start = byteOffset * 2;
  const value = data.slice(start, start + 64);
  if (value.length !== 64) throw new AbiDecodeError('Data ABI terlalu pendek');
  const parsed = Number(BigInt(`0x${value}`));
  if (!Number.isSafeInteger(parsed)) throw new AbiDecodeError('Angka ABI terlalu besar');
  return parsed;
}

/**
 * Calldata `aggregate3` dengan `allowFailure = true`, supaya satu panggilan
 * yang gagal tidak membatalkan yang lain.
 */
export function encodeAggregate3(calls: Array<{ target: string; callData: string }>): string {
  const tuples = calls.map(({ target, callData }) => {
    const data = strip(callData);
    return [
      encodeAddressArg(target),
      uintWord(1),
      uintWord(0x60),
      uintWord(data.length / 2),
      data.padEnd(Math.ceil(data.length / 64) * 64, '0'),
    ].join('');
  });
  let offset = calls.length * 32;
  const offsets = tuples.map((tuple) => {
    const current = uintWord(offset);
    offset += tuple.length / 2;
    return current;
  });
  return `${AGGREGATE3_SELECTOR}${uintWord(0x20)}${uintWord(calls.length)}${offsets.join('')}${tuples.join('')}`;
}

/** Hasil `aggregate3`: status dan data balikan tiap panggilan. */
export function decodeAggregate3(hex: string): Array<{ success: boolean; returnData: string }> {
  const data = strip(hex);
  const arrayStart = numberAt(data, 0);
  const length = numberAt(data, arrayStart);
  const base = arrayStart + 32;
  const results: Array<{ success: boolean; returnData: string }> = [];
  for (let index = 0; index < length; index++) {
    const tupleStart = base + numberAt(data, base + index * 32);
    const success = numberAt(data, tupleStart);
    if (success !== 0 && success !== 1) throw new AbiDecodeError('Status aggregate3 tidak valid');
    const bytesStart = tupleStart + numberAt(data, tupleStart + 32);
    const bytesLength = numberAt(data, bytesStart);
    const start = (bytesStart + 32) * 2;
    if (start + bytesLength * 2 > data.length) throw new AbiDecodeError('Data aggregate3 terpotong');
    results.push({ success: success === 1, returnData: `0x${data.slice(start, start + bytesLength * 2)}` });
  }
  return results;
}
