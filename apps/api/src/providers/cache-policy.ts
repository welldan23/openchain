/**
 * Berapa lama respons provider aman disimpan. Data yang terikat ke blok atau
 * hash tertentu tidak berubah lagi; data "terbaru" (blok terbaru, daftar
 * holder, harga) hanya disimpan sebentar.
 */
export const CACHE_TTL_MS = {
  /** Chain ID tidak pernah berubah. */
  chainId: 60 * 60 * 1000,
  /** Data pada blok atau hash tertentu. */
  immutable: 10 * 60 * 1000,
  /** Daftar dari indexer (holder, riwayat transfer). */
  indexer: 60 * 1000,
  /** Data pasar bergerak cepat. */
  market: 30 * 1000,
  /** Hasil analisis keamanan jarang berubah. */
  security: 5 * 60 * 1000,
} as const;

const HEX_QUANTITY = /^0x[0-9a-fA-F]+$/;

/** TTL untuk satu panggilan JSON-RPC; `0` bila hasilnya bisa berubah (mis. `latest`). */
export function rpcCacheTtl(method: string, params: readonly unknown[]): number {
  const isBlock = (value: unknown) => typeof value === 'string' && HEX_QUANTITY.test(value);
  switch (method) {
    case 'eth_chainId':
      return CACHE_TTL_MS.chainId;
    case 'eth_getTransactionByHash':
    case 'eth_getTransactionReceipt':
      return CACHE_TTL_MS.immutable;
    case 'eth_getBlockByNumber':
      return isBlock(params[0]) ? CACHE_TTL_MS.immutable : 0;
    case 'eth_call':
    case 'eth_getCode':
    case 'eth_getStorageAt':
      return isBlock(params[params.length - 1]) ? CACHE_TTL_MS.immutable : 0;
    case 'eth_getLogs': {
      const filter = params[0] as { fromBlock?: unknown; toBlock?: unknown } | undefined;
      return filter && isBlock(filter.fromBlock) && isBlock(filter.toBlock) ? CACHE_TTL_MS.immutable : 0;
    }
    default:
      return 0;
  }
}

/** Respons JSON-RPC yang boleh disimpan: berhasil dan hasilnya tidak kosong. */
export function cacheableRpcResponse(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.error === undefined || record.error === null) && 'result' in record && record.result !== null;
}
