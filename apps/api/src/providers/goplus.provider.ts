/**
 * GoPlus Security sebagai SecurityProvider: pajak, fungsi mint, blacklist,
 * pause, honeypot, dan LP yang terkunci. Gratis tanpa API key.
 *
 * Syarat pakai GoPlus: aplikasi wajib mencantumkan "Powered by GoPlus", dan
 * data GoPlus tidak boleh langsung dipakai untuk kegiatan komersial yang
 * menghasilkan uang tanpa izin tertulis dari GoPlus.
 */
import type { HttpClient } from './http-client.js';
import { ProviderError, type SecurityProvider, type TokenSecurityReport } from './provider.types.js';

export const GOPLUS_API_URL = 'https://api.gopluslabs.io';
export const GOPLUS_SOURCE_NAME = 'GoPlus Security';

/** Address tempat LP dibakar; LP di sini sama dengan terkunci permanen. */
const BURN_ADDRESSES = new Set(['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead']);

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Flag GoPlus "1"/"0"; selain itu dianggap tidak diketahui. */
function flag(value: unknown): boolean | null {
  if (value === '1' || value === 1) return true;
  if (value === '0' || value === 0) return false;
  return null;
}

/** Pajak GoPlus berupa pecahan ("0.05" = 5%); string kosong berarti tidak diketahui. */
function taxPct(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) return null;
  const pct = Number(value) * 100;
  return Number.isFinite(pct) ? String(Math.round(pct * 10_000) / 10_000) : null;
}

/**
 * Porsi LP dari daftar pemegang LP: yang terkunci atau dibakar, dan porsi
 * terbesar satu wallet biasa tanpa kunci. Porsi yang dipegang kontrak lain
 * tidak bisa dipastikan status kuncinya dari data ini.
 */
function lpShares(lpHolders: unknown): { locked: string; topWallet: string } | null {
  if (!Array.isArray(lpHolders) || lpHolders.length === 0) return null;
  let locked = 0;
  let topWallet = 0;
  for (const holder of lpHolders.filter(isRecord)) {
    const share = Number(holder.percent);
    if (!Number.isFinite(share)) return null;
    const address = typeof holder.address === 'string' ? holder.address.toLowerCase() : '';
    if (flag(holder.is_locked) === true || BURN_ADDRESSES.has(address)) locked += share;
    else if (flag(holder.is_contract) === false) topWallet = Math.max(topWallet, share);
  }
  const pct = (value: number) => String(Math.round(Math.min(value, 1) * 1_000_000) / 10_000);
  return { locked: pct(locked), topWallet: pct(topWallet) };
}

export class GoPlusProvider implements SecurityProvider {
  readonly name = 'goplus';

  /** @param chainId chain ID EVM, mis. 4663 untuk Robinhood Chain. */
  constructor(
    private readonly chainId: number,
    private readonly http: HttpClient,
    private readonly baseUrl = GOPLUS_API_URL,
  ) {}

  async getTokenSecurity(address: string): Promise<TokenSecurityReport | null> {
    const raw = await this.http.requestJson<unknown>({
      provider: this.name,
      url: `${this.baseUrl}/api/v1/token_security/${this.chainId}?contract_addresses=${address}`,
    });
    if (!isRecord(raw)) throw new ProviderError(this.name, 'Format respons tidak dikenali');
    if (raw.code !== 1) {
      const message = typeof raw.message === 'string' ? raw.message.slice(0, 120) : 'tanpa pesan';
      throw new ProviderError(this.name, `GoPlus menolak permintaan: ${message} (kode ${String(raw.code)})`);
    }
    if (!isRecord(raw.result)) return null;
    const entry = Object.entries(raw.result).find(([key]) => key.toLowerCase() === address.toLowerCase())?.[1];
    if (!isRecord(entry)) return null;

    const report: TokenSecurityReport = {
      sourceName: GOPLUS_SOURCE_NAME,
      honeypot: flag(entry.is_honeypot),
      buyTaxPct: taxPct(entry.buy_tax),
      sellTaxPct: taxPct(entry.sell_tax),
      transferTaxPct: taxPct(entry.transfer_tax),
      taxModifiable:
        flag(entry.slippage_modifiable) === true || flag(entry.personal_slippage_modifiable) === true
          ? true
          : flag(entry.slippage_modifiable),
      mintable: flag(entry.is_mintable),
      blacklist: flag(entry.is_blacklisted),
      pausable: flag(entry.transfer_pausable),
      lpLockedPct: null,
      lpTopWalletPct: null,
      missingFields: [],
    };
    const lp = lpShares(entry.lp_holders);
    report.lpLockedPct = lp?.locked ?? null;
    report.lpTopWalletPct = lp?.topWallet ?? null;
    const expected = ['honeypot', 'buyTaxPct', 'sellTaxPct', 'mintable', 'blacklist', 'pausable', 'lpLockedPct'] as const;
    report.missingFields = expected.filter((field) => report[field] === null).map((field) => `security.${field}`);
    return report;
  }
}
