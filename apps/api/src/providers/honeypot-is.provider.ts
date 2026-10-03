/**
 * honeypot.is sebagai SecurityProvider: simulasi beli dan jual sungguhan
 * untuk mengecek token bisa dijual dan berapa pajaknya. Gratis, saat ini tanpa
 * API key, untuk Ethereum, BNB Chain, dan Base.
 *
 * Syarat pakai honeypot.is: API tidak boleh dijual ulang atau dibuka ke pihak
 * ketiga, dan tidak boleh dipakai untuk produk yang bersaing langsung.
 */
import { HttpStatusError, type HttpClient } from './http-client.js';
import { ProviderError, type SecurityProvider, type TokenSecurityReport } from './provider.types.js';

export const HONEYPOT_IS_API_URL = 'https://api.honeypot.is';
export const HONEYPOT_IS_SOURCE_NAME = 'honeypot.is';
/** Chain ID EVM yang didukung honeypot.is (dicek langsung ke API-nya). */
export const HONEYPOT_IS_CHAIN_IDS: ReadonlySet<number> = new Set([1, 56, 8453]);

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pct(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? String(Math.round(value * 10_000) / 10_000) : null;
}

export class HoneypotIsProvider implements SecurityProvider {
  readonly name = 'honeypot.is';

  constructor(
    private readonly chainId: number,
    private readonly http: HttpClient,
    private readonly baseUrl = HONEYPOT_IS_API_URL,
  ) {}

  async getTokenSecurity(address: string): Promise<TokenSecurityReport | null> {
    let raw: unknown;
    try {
      raw = await this.http.requestJson<unknown>({
        provider: this.name,
        url: `${this.baseUrl}/v2/IsHoneypot?address=${address}&chainID=${this.chainId}`,
      });
    } catch (error) {
      // 404: honeypot.is belum mengenal token ini atau tidak menemukan pair-nya.
      if (error instanceof HttpStatusError && error.status === 404) return null;
      throw error;
    }
    if (!isRecord(raw)) throw new ProviderError(this.name, 'Format respons tidak dikenali');

    const simulated = raw.simulationSuccess === true;
    const result = isRecord(raw.honeypotResult) ? raw.honeypotResult : {};
    const simulation = simulated && isRecord(raw.simulationResult) ? raw.simulationResult : {};
    const report: TokenSecurityReport = {
      sourceName: HONEYPOT_IS_SOURCE_NAME,
      honeypot: typeof result.isHoneypot === 'boolean' ? result.isHoneypot : null,
      buyTaxPct: pct(simulation.buyTax),
      sellTaxPct: pct(simulation.sellTax),
      transferTaxPct: pct(simulation.transferTax),
      // Hal di bawah tidak diperiksa honeypot.is.
      taxModifiable: null,
      mintable: null,
      blacklist: null,
      pausable: null,
      lpLockedPct: null,
      lpTopWalletPct: null,
      missingFields: [],
    };
    const expected = ['honeypot', 'buyTaxPct', 'sellTaxPct'] as const;
    report.missingFields = expected.filter((field) => report[field] === null).map((field) => `security.${field}`);
    return report;
  }
}
