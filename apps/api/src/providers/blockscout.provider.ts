/**
 * Blockscout REST API v2 sebagai ExplorerProvider (verifikasi kontrak dan
 * pembuatnya), IndexedDataProvider (jumlah holder dan holder teratas), dan
 * AddressActivityProvider (riwayat transfer sebuah address).
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
  type ActivityPage,
  type AddressActivityProvider,
  type ExplorerContractInfo,
  type ExplorerProvider,
  type ExternalLabel,
  type IndexedDataProvider,
  type IndexedHolder,
  type IndexedNativeTransfer,
  type IndexedTokenInfo,
  type IndexedTokenTransfer,
  type PageCursor,
  type SkippedCounts,
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

function blockOf(value: unknown): number | null {
  return count(value);
}

function timeOf(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hashOf(party: unknown): string | null {
  return isRecord(party) ? text(party.hash) : null;
}

function amountOf(value: unknown): string | null {
  const raw = text(value);
  return raw && /^\d+$/.test(raw) ? raw : null;
}

/** `next_page_params` Blockscout jadi cursor; nilai kosong dibuang. */
function cursorOf(raw: unknown): PageCursor | null {
  if (!isRecord(raw)) return null;
  const entries = Object.entries(raw).flatMap(([key, value]) =>
    typeof value === 'string' || typeof value === 'number' ? [[key, String(value)] as const] : [],
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

const noneSkipped = (): SkippedCounts => ({ pending: 0, failed: 0, zeroValue: 0 });

type Seen = { blockNumber: number; timestamp: Date } | null;

function older(current: Seen, blockNumber: number, timestamp: Date | null): Seen {
  if (!timestamp) return current;
  return !current || blockNumber < current.blockNumber ? { blockNumber, timestamp } : current;
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

export class BlockscoutProvider implements ExplorerProvider, IndexedDataProvider, AddressActivityProvider {
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

  /**
   * Nilai native yang dikirim transaksi dari/ke address. Transaksi pending,
   * gagal, atau tanpa nilai tidak memindahkan dana, jadi dilewati (dan
   * dihitung di `skipped`).
   */
  async getNativeTransfers(
    address: string,
    cursor: PageCursor | null,
  ): Promise<ActivityPage<IndexedNativeTransfer> & { skipped: SkippedCounts }> {
    const page = await this.page(`/addresses/${address}/transactions`, cursor, 'daftar transaksi');
    const skipped = noneSkipped();
    const items: IndexedNativeTransfer[] = [];
    let oldestSeen: Seen = null;
    for (const raw of page.items) {
      const blockNumber = blockOf(raw.block_number);
      if (blockNumber === null) {
        skipped.pending += 1;
        continue;
      }
      oldestSeen = older(oldestSeen, blockNumber, timeOf(raw.timestamp));
      if (raw.status !== 'ok') {
        skipped.failed += 1;
        continue;
      }
      const amountRaw = amountOf(raw.value);
      const txHash = text(raw.hash);
      const from = hashOf(raw.from);
      const timestamp = timeOf(raw.timestamp);
      if (!amountRaw || !txHash || !from || !timestamp) throw this.malformed('daftar transaksi');
      // Transaksi pembuat kontrak tidak punya `to`; nilainya masuk ke kontrak baru.
      const to = hashOf(raw.to) ?? hashOf(raw.created_contract);
      if (amountRaw === '0' || !to) {
        skipped.zeroValue += 1;
        continue;
      }
      items.push({ txHash, kind: 'transaction', tracePath: '', from, to, amountRaw, blockNumber, timestamp });
    }
    return { items, next: page.next, skipped, oldestSeen };
  }

  /** Panggilan internal yang memindahkan native coin dan berhasil. */
  async getInternalTransfers(
    address: string,
    cursor: PageCursor | null,
  ): Promise<ActivityPage<IndexedNativeTransfer> & { skipped: SkippedCounts }> {
    const page = await this.page(`/addresses/${address}/internal-transactions`, cursor, 'daftar transaksi internal');
    const skipped = noneSkipped();
    const items: IndexedNativeTransfer[] = [];
    let oldestSeen: Seen = null;
    for (const raw of page.items) {
      const blockNumber = blockOf(raw.block_number);
      const txHash = text(raw.transaction_hash);
      const index = count(raw.index);
      const from = hashOf(raw.from);
      const timestamp = timeOf(raw.timestamp);
      const amountRaw = amountOf(raw.value);
      if (blockNumber === null || !txHash || index === null || !from || !timestamp || !amountRaw) {
        throw this.malformed('daftar transaksi internal');
      }
      oldestSeen = older(oldestSeen, blockNumber, timestamp);
      if (raw.success === false) {
        skipped.failed += 1;
        continue;
      }
      const to = hashOf(raw.to) ?? hashOf(raw.created_contract);
      if (amountRaw === '0' || !to) {
        skipped.zeroValue += 1;
        continue;
      }
      items.push({ txHash, kind: 'internal', tracePath: String(index), from, to, amountRaw, blockNumber, timestamp });
    }
    return { items, next: page.next, skipped, oldestSeen };
  }

  /** Transfer token ERC-20 dari/ke address. */
  async getTokenTransfers(address: string, cursor: PageCursor | null): Promise<ActivityPage<IndexedTokenTransfer>> {
    const page = await this.page(`/addresses/${address}/token-transfers`, { ...cursor, type: 'ERC-20' }, 'daftar transfer token');
    const items = page.items.map((raw): IndexedTokenTransfer => {
      const token = isRecord(raw.token) ? raw.token : null;
      const total = isRecord(raw.total) ? raw.total : null;
      const tokenAddress = token ? (text(token.address_hash) ?? text(token.address)) : null;
      const txHash = text(raw.transaction_hash) ?? text(raw.tx_hash);
      const logIndex = count(raw.log_index);
      const blockNumber = blockOf(raw.block_number);
      const from = hashOf(raw.from);
      const to = hashOf(raw.to);
      const amountRaw = total ? amountOf(total.value) : null;
      const timestamp = timeOf(raw.timestamp);
      if (!tokenAddress || !txHash || logIndex === null || blockNumber === null || !from || !to || !amountRaw || !timestamp) {
        throw this.malformed('daftar transfer token');
      }
      const decimals = count(token?.decimals ?? total?.decimals);
      return {
        txHash,
        logIndex,
        token: {
          address: tokenAddress,
          symbol: token ? text(token.symbol) : null,
          name: token ? text(token.name) : null,
          decimals: decimals !== null && decimals <= 255 ? decimals : null,
        },
        from,
        to,
        amountRaw,
        blockNumber,
        timestamp,
      };
    });
    return { items, next: page.next };
  }

  /** Satu halaman daftar; address yang belum dikenal indexer berarti daftar kosong. */
  private async page(path: string, cursor: PageCursor | null, what: string): Promise<{ items: RawRecord[]; next: PageCursor | null }> {
    const query = cursor && Object.keys(cursor).length > 0 ? `?${new URLSearchParams(cursor).toString()}` : '';
    const raw = await this.get(`${path}${query}`);
    if (raw === null) return { items: [], next: null };
    if (!Array.isArray(raw.items) || !raw.items.every(isRecord)) throw this.malformed(what);
    return { items: raw.items, next: cursorOf(raw.next_page_params) };
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
