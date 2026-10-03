/**
 * Blockscout REST API v2 sebagai ExplorerProvider (verifikasi kontrak dan
 * pembuatnya) dan IndexedDataProvider (jumlah holder dan holder teratas).
 *
 * Bisa memakai instance publik (mis. https://eth.blockscout.com) atau PRO API
 * (https://api.blockscout.com/<chain id>) dengan API key. API key dikirim
 * lewat header `authorization`, bukan query string, supaya tidak ikut tercatat
 * di log URL.
 */
import type { EntityLabelType } from '../database/schema/enums.js';
import { HttpStatusError, type HttpClient } from './http-client.js';
import {
  ProviderError,
  type ExplorerContractInfo,
  type ExplorerProvider,
  type ExternalLabel,
  type IndexedDataProvider,
  type IndexedHolder,
  type IndexedTokenInfo,
} from './provider.types.js';

export const BLOCKSCOUT_PRO_API_URL = 'https://api.blockscout.com';

export interface BlockscoutConfig {
  /** Base API tanpa `/api/v2`, mis. `https://eth.blockscout.com`. */
  baseUrl: string;
  /** API key PRO API; `null` untuk instance publik. */
  apiKey: string | null;
  timeoutMs?: number;
}

/**
 * Tag generik Blockscout yang dipetakan ke jenis label OpenChain. Tag lain
 * (mis. `hot-wallet` atau `token-contract`) tidak dipetakan supaya label tidak
 * terdengar lebih pasti daripada sumbernya.
 */
export const BLOCKSCOUT_TAG_LABELS: Readonly<Record<string, EntityLabelType>> = {
  exchange: 'exchange',
  'liquidity-pool': 'liquidity_pool',
  bridge: 'bridge',
  burn: 'burn',
  'market-maker': 'market_maker',
  'mev-bot': 'bot',
  bot: 'bot',
  treasury: 'treasury',
  faucet: 'faucet',
  launchpad: 'launchpad',
  router: 'router',
};

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function flag(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function count(value: unknown): number | null {
  const raw = typeof value === 'number' ? String(value) : value;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Label eksternal dari tag metadata Blockscout sebuah address. */
export function labelsFromBlockscoutTags(tags: unknown): ExternalLabel[] {
  if (!Array.isArray(tags)) return [];
  const records = tags.filter(isRecord);
  const nameOf = (tagType: string) => text(records.find((tag) => tag.tagType === tagType && text(tag.name))?.name);
  const name = nameOf('name') ?? nameOf('protocol');
  const types = new Set<EntityLabelType>();
  for (const tag of records) {
    const slug = tag.tagType === 'generic' ? text(tag.slug) : null;
    const type = slug ? BLOCKSCOUT_TAG_LABELS[slug] : undefined;
    if (type) types.add(type);
  }
  return [...types].map((type) => ({ type, name: name ? name.slice(0, 120) : null }));
}

export class BlockscoutProvider implements ExplorerProvider, IndexedDataProvider {
  readonly name = 'blockscout';

  constructor(
    private readonly config: BlockscoutConfig,
    private readonly http: HttpClient,
  ) {}

  async getContract(address: string): Promise<ExplorerContractInfo | null> {
    const raw = await this.get(`/addresses/${address}`);
    if (raw === null) return null;
    return {
      isContract: flag(raw.is_contract),
      verified: flag(raw.is_verified),
      contractName: text(raw.name),
      creatorAddress: text(raw.creator_address_hash),
      // Versi Blockscout lama memakai `creation_tx_hash`.
      creationTxHash: text(raw.creation_transaction_hash) ?? text(raw.creation_tx_hash),
    };
  }

  async getTokenInfo(address: string): Promise<IndexedTokenInfo | null> {
    const raw = await this.get(`/tokens/${address}`);
    if (raw === null) return null;
    return { type: text(raw.type), holderCount: count(raw.holders_count ?? raw.holders) };
  }

  /** Halaman pertama holder (50 teratas menurut indexer). */
  async getTopHolders(address: string): Promise<IndexedHolder[]> {
    const raw = await this.get(`/tokens/${address}/holders`);
    if (raw === null) return [];
    if (!Array.isArray(raw.items)) throw this.malformed('daftar holder');
    return raw.items.map((item) => {
      const holder = isRecord(item) && isRecord(item.address) ? item.address : null;
      const hash = holder ? text(holder.hash) : null;
      const value = isRecord(item) ? text(item.value) : null;
      if (!holder || !hash || !value || !/^\d+$/.test(value)) throw this.malformed('daftar holder');
      return {
        address: hash,
        isContract: flag(holder.is_contract),
        balanceRaw: value,
        labels: labelsFromBlockscoutTags(isRecord(holder.metadata) ? holder.metadata.tags : null),
      };
    });
  }

  /** GET ke API v2; `null` bila Blockscout menjawab 404. */
  private async get(path: string): Promise<RawRecord | null> {
    let raw: unknown;
    try {
      raw = await this.http.requestJson<unknown>({
        provider: this.name,
        url: `${this.config.baseUrl.replace(/\/+$/, '')}/api/v2${path}`,
        headers: this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : undefined,
        timeoutMs: this.config.timeoutMs,
      });
    } catch (error) {
      if (error instanceof HttpStatusError && error.status === 404) return null;
      throw error;
    }
    if (!isRecord(raw)) throw this.malformed('respons');
    return raw;
  }

  private malformed(what: string): ProviderError {
    return new ProviderError(this.name, `Format ${what} tidak dikenali`);
  }
}
