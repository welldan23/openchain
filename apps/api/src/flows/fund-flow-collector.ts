/**
 * Mengumpulkan aliran dana satu address dari provider read-only, di satu
 * chain atau di beberapa chain sekaligus. Tidak menulis ke database.
 *
 * Tiga jenis transfer dibaca terpisah (nilai transaksi, panggilan internal,
 * transfer token) supaya kegagalan satu jenis tidak menghapus yang lain. Setiap
 * pengambilan dicatat sebagai run provider, termasuk yang gagal, dan cakupan
 * pemindaian dihitung oleh `summarizeCoverage`. Hasil yang gagal diambil tidak
 * pernah dikarang: transfer yang tidak terbaca tetap kosong dan ditandai.
 */
import type { Clock } from '../common/clock.js';
import { mapLimit } from '../common/concurrency.js';
import type { ChainFamily, ProviderKind } from '../database/schema/enums.js';
import { normalizeAddress } from '../database/identifiers.js';
import {
  ProviderError,
  type ActivityPage,
  type AddressActivityProvider,
  type ExternalLabel,
  type IndexedNativeTransfer,
  type IndexedTokenTransfer,
  type PageCursor,
  type ProviderRunRecord,
  type RpcProvider,
  type SkippedCounts,
} from '../providers/provider.types.js';
import { summarizeCoverage } from './fund-flow-coverage.js';
import type { AddressFlowCollection, ChainHead, FlowTransferKind, KindCoverage } from './fund-flow.types.js';

export interface FundFlowSources {
  family: ChainFamily;
  /** Indexer riwayat address; `null` bila chain ini belum punya. */
  activity: AddressActivityProvider | null;
  /** Untuk membaca blok terbaru sebagai batas atas pemindaian. */
  rpc: RpcProvider | null;
}

export interface FundFlowCollectorOptions {
  /** Halaman maksimum per jenis transfer (default 5, ±250 item per jenis di Blockscout). */
  maxPages?: number;
  /** Chain yang dikumpulkan bersamaan pada `collectAcross` (default 3). */
  concurrency?: number;
}

const OPERATION: Record<FlowTransferKind, string> = {
  native: 'address.native_transfers',
  internal: 'address.internal_transfers',
  tokens: 'address.token_transfers',
};

/** Alasan yang aman disimpan: pesan provider, tanpa URL atau header. */
function reasonOf(error: unknown): string {
  return error instanceof ProviderError ? error.reason : 'Kesalahan tak terduga saat membaca provider';
}

function addSkipped(total: SkippedCounts, more: SkippedCounts): void {
  total.pending += more.pending;
  total.failed += more.failed;
  total.zeroValue += more.zeroValue;
}

type Fetcher<T> = (cursor: PageCursor | null) => Promise<ActivityPage<T> & { skipped?: SkippedCounts }>;

type CollectedLabels = Map<string, { labels: ExternalLabel[]; runKey: string }>;

export class FundFlowCollector {
  private readonly maxPages: number;
  private readonly concurrency: number;

  constructor(
    private readonly sources: (chainId: string) => FundFlowSources,
    private readonly clock: Clock,
    options: FundFlowCollectorOptions = {},
  ) {
    this.maxPages = Math.max(1, options.maxPages ?? 5);
    this.concurrency = Math.max(1, options.concurrency ?? 3);
  }

  /**
   * Kumpulkan di beberapa chain. Satu chain yang gagal tidak menggagalkan
   * chain lain; kegagalannya tercatat di hasil chain itu.
   */
  async collectAcross(chainIds: readonly string[], address: string): Promise<AddressFlowCollection[]> {
    return mapLimit(chainIds, this.concurrency, (chainId) => this.collect(chainId, address));
  }

  async collect(chainId: string, rawAddress: string): Promise<AddressFlowCollection> {
    const address = rawAddress.trim();
    const sources = this.sources(chainId);
    // Address yang salah format ditolak sebelum menghubungi provider mana pun.
    normalizeAddress(sources.family, address);
    const fetchedAt = this.clock.now();
    const runs: ProviderRunRecord[] = [];
    const partyLabels: CollectedLabels = new Map();

    const head = await this.readHead(chainId, sources.rpc, runs);
    const activity = sources.activity;
    const noIndexer = 'Belum ada indexer riwayat address untuk chain ini';
    const native = activity
      ? await this.readAll('native', activity.name, address, (cursor) => activity.getNativeTransfers(address, cursor), runs, partyLabels)
      : this.missing(noIndexer);
    const internal = activity
      ? await this.readAll('internal', activity.name, address, (cursor) => activity.getInternalTransfers(address, cursor), runs, partyLabels)
      : this.missing(noIndexer);
    const tokens = activity
      ? await this.readAll('tokens', activity.name, address, (cursor) => activity.getTokenTransfers(address, cursor), runs, partyLabels)
      : this.missing(noIndexer);

    const coverage = { native: native.coverage, internal: internal.coverage, tokens: tokens.coverage };
    const nativeTransfers = [...native.items, ...internal.items];
    const tokenTransfers = tokens.items;
    const scan = summarizeCoverage({ coverage, head, nativeTransfers, tokenTransfers });
    const allFailed = [native, internal, tokens].every((part) => part.coverage.failure !== null);
    return {
      chainId,
      address,
      fetchedAt,
      runs,
      head,
      nativeTransfers,
      tokenTransfers,
      coverage,
      scan,
      failure: allFailed ? (activity ? 'Semua sumber riwayat transfer gagal dibaca' : noIndexer) : null,
      partyLabels: [...partyLabels].map(([labelAddress, entry]) => ({ address: labelAddress, ...entry })),
    };
  }

  private async readHead(chainId: string, rpc: RpcProvider | null, runs: ProviderRunRecord[]): Promise<ChainHead | null> {
    if (!rpc) return null;
    const startedAt = this.clock.now();
    try {
      const block = await rpc.getBlock('latest');
      if (!block) throw new ProviderError(rpc.name, 'Blok terbaru tidak ditemukan');
      runs.push(this.run(rpc.name, 'rpc', 'chain.head', chainId, startedAt, null, { blockFrom: block.number, blockTo: block.number }));
      return { blockNumber: block.number, timestamp: block.timestamp };
    } catch (error) {
      runs.push(this.run(rpc.name, 'rpc', 'chain.head', chainId, startedAt, reasonOf(error)));
      return null;
    }
  }

  /** Baca halaman demi halaman dari yang terbaru sampai habis atau batas halaman. */
  private async readAll<T extends IndexedNativeTransfer | IndexedTokenTransfer>(
    kind: FlowTransferKind,
    provider: string,
    address: string,
    fetchPage: Fetcher<T>,
    runs: ProviderRunRecord[],
    partyLabels: CollectedLabels,
  ): Promise<{ items: T[]; coverage: KindCoverage }> {
    const startedAt = this.clock.now();
    const items: T[] = [];
    const skipped: SkippedCounts = { pending: 0, failed: 0, zeroValue: 0 };
    let cursor: PageCursor | null = null;
    let pages = 0;
    let exhausted = false;
    let oldestSeen: KindCoverage['oldest'] = null;
    const pageLabels: CollectedLabels = new Map();
    const runKey = `${OPERATION[kind]}:${address}`;
    try {
      while (pages < this.maxPages) {
        const page = await fetchPage(cursor);
        pages += 1;
        items.push(...page.items);
        if (page.skipped) addSkipped(skipped, page.skipped);
        if (page.oldestSeen && (!oldestSeen || page.oldestSeen.blockNumber < oldestSeen.blockNumber)) oldestSeen = page.oldestSeen;
        for (const [labelAddress, labels] of Object.entries(page.partyLabels ?? {})) {
          if (!pageLabels.has(labelAddress)) pageLabels.set(labelAddress, { labels, runKey });
        }
        cursor = page.next;
        if (!cursor) {
          exhausted = true;
          break;
        }
      }
    } catch (error) {
      // Halaman yang sudah terbaca tidak dipakai: cakupannya tidak bisa dijamin.
      runs.push(this.run(provider, 'indexed_data', OPERATION[kind], address, startedAt, reasonOf(error)));
      return { items: [], coverage: this.missing(reasonOf(error)).coverage };
    }
    // Label hanya dipakai bila pengambilan jenis ini berhasil sampai akhir.
    for (const [labelAddress, entry] of pageLabels) if (!partyLabels.has(labelAddress)) partyLabels.set(labelAddress, entry);
    // Termasuk item yang dilewati: blok itu sudah terbaca walau tanpa transfer.
    const oldest = items.reduce<KindCoverage['oldest']>(
      (current, item) =>
        !current || item.blockNumber < current.blockNumber ? { blockNumber: item.blockNumber, timestamp: item.timestamp } : current,
      oldestSeen,
    );
    const newest = items.reduce((max, item) => Math.max(max, item.blockNumber), 0);
    runs.push(
      this.run(provider, 'indexed_data', OPERATION[kind], address, startedAt, null, {
        blockFrom: exhausted ? 0 : (oldest?.blockNumber ?? null),
        blockTo: items.length > 0 ? newest : null,
      }),
    );
    return { items, coverage: { failure: null, exhausted, pages, oldest, skipped: kind === 'tokens' ? null : skipped } };
  }

  private missing(reason: string): { items: never[]; coverage: KindCoverage } {
    return { items: [], coverage: { failure: reason, exhausted: false, pages: 0, oldest: null, skipped: null } };
  }

  private run(
    provider: string,
    kind: ProviderKind,
    operation: string,
    subject: string,
    startedAt: Date,
    failure: string | null,
    range: { blockFrom: number | null; blockTo: number | null } = { blockFrom: null, blockTo: null },
  ): ProviderRunRecord {
    return {
      key: `${operation}:${subject}`,
      provider,
      kind,
      operation,
      subject,
      status: failure ? 'unavailable' : 'complete',
      errorReason: failure,
      missingFields: [],
      blockFrom: range.blockFrom,
      blockTo: range.blockTo,
      startedAt,
      fetchedAt: this.clock.now(),
    };
  }
}
