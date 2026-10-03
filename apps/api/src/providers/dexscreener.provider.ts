/**
 * Dexscreener sebagai MarketDataProvider: harga, likuiditas, volume, dan
 * jumlah transaksi dari pair DEX. API publik tanpa API key, batas 300
 * request per menit untuk endpoint yang dipakai di sini.
 */
import { normalizeAddress } from '../database/identifiers.js';
import type { ChainFamily } from '../database/schema/enums.js';
import type { HttpClient } from './http-client.js';
import { ProviderError, type MarketDataProvider, type TokenMarketData } from './provider.types.js';

export const DEXSCREENER_API_URL = 'https://api.dexscreener.com';

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Batas kolom snapshot: nilai absolut maksimum dan jumlah angka di belakang
 * koma. Nilai di luar batas tidak disimpan supaya tidak menjadi fakta palsu.
 */
const COLUMNS = {
  // Harga bukan nol yang terbulatkan jadi nol akan menyesatkan, jadi ditolak.
  priceUsd: { maxAbs: 1e20, scale: 18, rejectRoundedToZero: true },
  priceChange24hPct: { maxAbs: 1e8, scale: 4, rejectRoundedToZero: false },
  usd: { maxAbs: 1e28, scale: 2, rejectRoundedToZero: false },
} as const;
const MAX_TX_COUNT = 2 ** 31 - 1;

/**
 * Angka desimal tanpa notasi eksponen, dibulatkan sesuai skala kolom supaya
 * sisa pembulatan floating point tidak ikut tersimpan.
 */
function decimal(value: unknown, column: { maxAbs: number; scale: number; rejectRoundedToZero: boolean }): string | null {
  let parsed: number;
  if (typeof value === 'number') parsed = value;
  else if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) parsed = Number(value);
  else return null;
  if (!Number.isFinite(parsed) || Math.abs(parsed) >= column.maxAbs) return null;
  if (column.rejectRoundedToZero && parsed !== 0 && Math.abs(parsed) < 10 ** -column.scale) return null;
  if (typeof value === 'string') return value;
  return new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: column.scale }).format(parsed);
}

function numberAt(record: unknown, ...path: string[]): number | null {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : null;
}

/**
 * Ringkasan pasar dari semua pair yang memakai token sebagai base token:
 * harga, perubahan 24 jam, market cap, dan FDV dari pair dengan likuiditas
 * terbesar; likuiditas, volume, dan jumlah transaksi dijumlahkan dari semua
 * pair tersebut. Dexscreener mengembalikan paling banyak 30 pool teratas.
 */
export function summarizePairs(pairs: unknown[], isToken: (address: string) => boolean): TokenMarketData {
  const poolCount = pairs.filter(isRecord).length;
  const own = pairs.filter(
    (pair): pair is RawRecord =>
      isRecord(pair) && isRecord(pair.baseToken) && typeof pair.baseToken.address === 'string' && isToken(pair.baseToken.address),
  );
  const empty: TokenMarketData = {
    poolCount,
    pairCount: 0,
    priceUsd: null,
    priceChange24hPct: null,
    marketCapUsd: null,
    fdvUsd: null,
    liquidityUsd: null,
    volume24hUsd: null,
    txCount24h: null,
    missingFields: [],
  };
  if (own.length === 0) return empty;

  const top = own.reduce((best, pair) =>
    (numberAt(pair, 'liquidity', 'usd') ?? -1) > (numberAt(best, 'liquidity', 'usd') ?? -1) ? pair : best,
  );
  const sum = (values: Array<number | null>): number | null => {
    const present = values.filter((value): value is number => value !== null);
    return present.length === 0 ? null : present.reduce((total, value) => total + value, 0);
  };
  const txns = sum(
    own.map((pair) => {
      const buys = numberAt(pair, 'txns', 'h24', 'buys');
      const sells = numberAt(pair, 'txns', 'h24', 'sells');
      return buys === null || sells === null ? null : buys + sells;
    }),
  );

  const result: TokenMarketData = {
    poolCount,
    pairCount: own.length,
    priceUsd: decimal(top.priceUsd, COLUMNS.priceUsd),
    priceChange24hPct: decimal(numberAt(top, 'priceChange', 'h24'), COLUMNS.priceChange24hPct),
    marketCapUsd: decimal(top.marketCap, COLUMNS.usd),
    fdvUsd: decimal(top.fdv, COLUMNS.usd),
    liquidityUsd: decimal(sum(own.map((pair) => numberAt(pair, 'liquidity', 'usd'))), COLUMNS.usd),
    volume24hUsd: decimal(sum(own.map((pair) => numberAt(pair, 'volume', 'h24'))), COLUMNS.usd),
    txCount24h: txns !== null && Number.isSafeInteger(txns) && txns <= MAX_TX_COUNT ? txns : null,
    missingFields: [],
  };
  const fields = ['priceUsd', 'priceChange24hPct', 'marketCapUsd', 'fdvUsd', 'liquidityUsd', 'volume24hUsd', 'txCount24h'] as const;
  result.missingFields = fields.filter((field) => result[field] === null).map((field) => `market.${field}`);
  return result;
}

export class DexscreenerProvider implements MarketDataProvider {
  readonly name = 'dexscreener';

  /**
   * @param chainSlug id chain versi Dexscreener, mis. `robinhood` atau `ethereum`.
   * @param family keluarga chain untuk membandingkan address dengan benar.
   */
  constructor(
    private readonly chainSlug: string,
    private readonly family: ChainFamily,
    private readonly http: HttpClient,
    private readonly baseUrl = DEXSCREENER_API_URL,
  ) {}

  async getTokenMarket(address: string): Promise<TokenMarketData> {
    const target = normalizeAddress(this.family, address);
    const raw = await this.http.requestJson<unknown>({
      provider: this.name,
      url: `${this.baseUrl}/token-pairs/v1/${this.chainSlug}/${address}`,
    });
    if (!Array.isArray(raw)) throw new ProviderError(this.name, 'Format daftar pair tidak dikenali');
    return summarizePairs(raw, (candidate) => {
      try {
        return normalizeAddress(this.family, candidate) === target;
      } catch {
        return false;
      }
    });
  }
}
