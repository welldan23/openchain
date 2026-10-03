/**
 * Adapter chain EVM. Satu kelas dipakai semua chain EVM; perbedaannya ada di
 * `EvmChainDefinition` dan provider yang diberikan registry.
 *
 * Urutan pengambilan data token:
 * 1. Explorer, indexer, dan data pasar diambil paralel lebih dulu.
 * 2. Setelah itu blok dipatok dan semua state on-chain dibaca pada blok itu:
 *    metadata, owner, proxy, dan saldo holder. Blok yang dipatok berada
 *    beberapa blok di belakang blok terbaru (default 3), supaya node RPC di
 *    balik load balancer yang sedikit tertinggal tetap punya blok itu dan
 *    reorg dangkal tidak mengubah snapshot. Membaca paling akhir membuat
 *    jaraknya pendek, sehingga node non-archive masih menyimpan state-nya.
 *
 * Data yang gagal diambil tidak ditebak: field-nya kosong, dan alasannya
 * dicatat di run provider.
 */
import { createHash } from 'node:crypto';
import { mapLimit } from '../../common/concurrency.js';
import { dedupeAddresses, normalizeAddress, normalizeTxHash } from '../../database/identifiers.js';
import type { DataStatus, ProviderKind } from '../../database/schema/enums.js';
import {
  ProviderError,
  RpcRevertError,
  type EvmBlock,
  type ExplorerContractInfo,
  type ExplorerProvider,
  type IndexedDataProvider,
  type IndexedHolder,
  type IndexedTokenInfo,
  type MarketDataProvider,
  type ProviderRunRecord,
  type RpcProvider,
  type TokenMarketData,
} from '../../providers/provider.types.js';
import type { EvmChainDefinition } from '../chain-definitions.js';
import type {
  ChainAdapter,
  CollectedHolder,
  SmokeCheck,
  SmokeTestReport,
  TokenCollection,
} from '../chain-adapter.types.js';
import { distributeHolders } from '../holder-distribution.js';
import {
  AbiDecodeError,
  decodeAddress,
  decodeAggregate3,
  decodeSlotAddress,
  decodeString,
  decodeUint256,
  EIP1967_SLOTS,
  encodeAggregate3,
  encodeBalanceOf,
  minimalProxyTarget,
  MULTICALL3_ADDRESS,
  MULTICALL3_CODE_SHA256,
  SELECTORS,
  ZERO_ADDRESS,
} from './abi.js';
import {
  ownershipCheck,
  proxyCheck,
  unanalyzedChecks,
  verifiedCheck,
  type OwnerState,
  type ProxyState,
} from './evm-contract-checks.js';

export interface EvmAdapterProviders {
  rpc: RpcProvider;
  explorer: ExplorerProvider | null;
  indexer: IndexedDataProvider | null;
  market: MarketDataProvider | null;
}

export interface EvmAdapterOptions {
  now?: () => Date;
  /** Jarak blok yang dipatok dari blok terbaru (default 3). */
  confirmations?: number;
  /** Jumlah `eth_call` saldo holder yang berjalan bersamaan. */
  concurrency?: number;
  /** Batas umur blok terbaru agar RPC dianggap sehat saat smoke test. */
  maxHeadAgeMs?: number;
  /**
   * Multicall3 yang dipercaya untuk menggabungkan `balanceOf`; `null`
   * mematikannya. Default: Multicall3 kanonik.
   */
  multicall?: { address: string; codeSha256: string } | null;
}

/** Jumlah panggilan per `aggregate3`; sama dengan satu halaman holder indexer. */
const MULTICALL_CHUNK = 50;

/** Kunci run provider dalam satu pengambilan. */
export const RUN_KEYS = { rpc: 'rpc', explorer: 'explorer', indexer: 'indexer', market: 'market' } as const;

const NOT_CONFIGURED = 'none';

type CallOutcome = { kind: 'ok'; data: string } | { kind: 'reverted' } | { kind: 'error'; reason: string };

/** Catatan field yang hilang dan alasannya selama satu run. */
class RunNotes {
  readonly missing: string[] = [];
  private readonly reasons = new Set<string>();

  fail(field: string, reason: string): void {
    if (!this.missing.includes(field)) this.missing.push(field);
    this.reasons.add(reason);
  }

  get errorReason(): string | null {
    return this.reasons.size === 0 ? null : [...this.reasons].join('; ').slice(0, 500);
  }
}

interface RunMeta {
  key: string;
  provider: string;
  kind: ProviderKind;
  operation: string;
  subject: string;
  startedAt: Date;
}

interface OnchainState {
  run: ProviderRunRecord;
  failure: string | null;
  blockNumber: number | null;
  blockTimestamp: Date | null;
  fetchedAt: Date;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: bigint | null;
  /** totalSupply() dan decimals() sama-sama tidak ada: bukan ERC-20. */
  notErc20: boolean;
  owner: OwnerState;
  proxy: ProxyState;
  holders: { holders: CollectedHolder[]; concentration: { top10Pct: string; top50Pct: string } } | null;
  deployment: { deployer: string; txHash: string; deployedAt: Date | null } | null;
}

/** Alasan aman dari error provider; error lain dianggap bug dan dilempar ulang. */
function reasonOf(error: unknown): string {
  if (error instanceof ProviderError) return error.reason;
  if (error instanceof AbiDecodeError) return `Data tidak bisa dibaca: ${error.message}`;
  throw error;
}

class SmokeFailure extends Error {}

export class EvmChainAdapter implements ChainAdapter {
  readonly chainId: string;
  private readonly now: () => Date;
  private readonly concurrency: number;
  private readonly maxHeadAgeMs: number;
  private readonly confirmations: number;
  private readonly multicall: { address: string; codeSha256: string } | null;

  constructor(
    private readonly definition: EvmChainDefinition,
    private readonly providers: EvmAdapterProviders,
    options: EvmAdapterOptions = {},
  ) {
    this.chainId = definition.id;
    this.now = options.now ?? (() => new Date());
    this.concurrency = options.concurrency ?? 5;
    this.maxHeadAgeMs = options.maxHeadAgeMs ?? 15 * 60_000;
    this.confirmations = options.confirmations ?? 3;
    this.multicall =
      options.multicall === undefined ? { address: MULTICALL3_ADDRESS, codeSha256: MULTICALL3_CODE_SHA256 } : options.multicall;
  }

  /** Nomor blok yang dipatok: blok terbaru dikurangi jarak konfirmasi. */
  private async pinnedBlockNumber(): Promise<number> {
    return Math.max(0, (await this.providers.rpc.blockNumber()) - this.confirmations);
  }

  async collectToken(rawAddress: string): Promise<TokenCollection> {
    const address = rawAddress.trim();
    const token = normalizeAddress('evm', address);

    const [explorer, indexer, market] = await Promise.all([
      this.collectExplorer(token),
      this.collectIndexer(token),
      this.collectMarket(token),
    ]);
    const onchain = await this.collectOnchain(token, indexer.holders, explorer.info?.creationTxHash ?? null);
    const runs = [onchain.run, explorer.run, indexer.run, market.run];

    const failure = onchain.failure ?? this.notErc20Reason(indexer.info, onchain);
    const base: TokenCollection = {
      chainId: this.chainId,
      address,
      runs,
      failure,
      blockNumber: onchain.blockNumber,
      blockTimestamp: onchain.blockTimestamp,
      fetchedAt: onchain.fetchedAt,
      token: null,
      market: null,
      holderCount: null,
      holders: null,
      concentration: null,
      checks: [],
    };
    if (failure !== null || onchain.blockNumber === null) return base;

    const context = {
      token,
      blockNumber: onchain.blockNumber,
      blockTimestamp: onchain.blockTimestamp,
      rpcRunKey: RUN_KEYS.rpc,
    };
    return {
      ...base,
      token: {
        standard: 'erc20',
        name: onchain.name,
        symbol: onchain.symbol,
        decimals: onchain.decimals,
        totalSupplyRaw: onchain.totalSupply?.toString() ?? null,
        sourceVerified: explorer.info?.verified ?? null,
        deployer: onchain.deployment?.deployer ?? null,
        deployTxHash: onchain.deployment?.txHash ?? null,
        deployedAt: onchain.deployment?.deployedAt ?? null,
      },
      market: market.data && market.data.pairCount > 0 ? withoutMeta(market.data) : null,
      holderCount: indexer.info?.holderCount ?? null,
      holders: onchain.holders?.holders ?? null,
      concentration: onchain.holders?.concentration ?? null,
      checks: [
        verifiedCheck(explorer.info, explorer.run, context),
        ownershipCheck(onchain.owner, context),
        proxyCheck(onchain.proxy, context),
        ...unanalyzedChecks(),
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Provider off-chain
  // -------------------------------------------------------------------------

  private async collectExplorer(token: string): Promise<{ run: ProviderRunRecord; info: ExplorerContractInfo | null }> {
    const explorer = this.providers.explorer;
    const meta = this.meta(RUN_KEYS.explorer, explorer?.name ?? NOT_CONFIGURED, 'explorer', 'token.contract', token);
    if (!explorer) return { run: this.unavailable(meta, 'Belum ada explorer yang bisa dipakai untuk chain ini'), info: null };
    try {
      const info = await explorer.getContract(token);
      if (!info) return { run: this.unavailable(meta, 'Explorer belum mengenal address ini'), info: null };
      const notes = new RunNotes();
      if (info.verified === null) notes.fail('contract.verified', 'Explorer tidak menyebut status verifikasi');
      if (!info.creationTxHash) notes.fail('token.deployment', 'Explorer tidak menyimpan tx pembuatan kontrak');
      return { run: this.finish(meta, notes), info };
    } catch (error) {
      return { run: this.unavailable(meta, reasonOf(error)), info: null };
    }
  }

  private async collectIndexer(
    token: string,
  ): Promise<{ run: ProviderRunRecord; info: IndexedTokenInfo | null; holders: IndexedHolder[] }> {
    const indexer = this.providers.indexer;
    const meta = this.meta(RUN_KEYS.indexer, indexer?.name ?? NOT_CONFIGURED, 'indexed_data', 'token.holders', token);
    if (!indexer) return { run: this.unavailable(meta, 'Belum ada indexer yang bisa dipakai untuk chain ini'), info: null, holders: [] };
    let info: IndexedTokenInfo | null;
    try {
      info = await indexer.getTokenInfo(token);
    } catch (error) {
      return { run: this.unavailable(meta, reasonOf(error)), info: null, holders: [] };
    }
    if (!info) return { run: this.unavailable(meta, 'Indexer belum mengenal token ini'), info: null, holders: [] };
    const notes = new RunNotes();
    if (info.holderCount === null) notes.fail('holders.count', 'Indexer tidak menyebut jumlah holder');
    let holders: IndexedHolder[] = [];
    try {
      holders = await indexer.getTopHolders(token);
    } catch (error) {
      notes.fail('holders.list', reasonOf(error));
    }
    return { run: this.finish(meta, notes), info, holders };
  }

  private async collectMarket(token: string): Promise<{ run: ProviderRunRecord; data: TokenMarketData | null }> {
    const market = this.providers.market;
    const meta = this.meta(RUN_KEYS.market, market?.name ?? NOT_CONFIGURED, 'market_data', 'token.market', token);
    if (!market) return { run: this.unavailable(meta, 'Belum ada sumber data pasar untuk chain ini'), data: null };
    try {
      const data = await market.getTokenMarket(token);
      if (data.poolCount === 0) return { run: this.unavailable(meta, 'Tidak ada pair DEX untuk token ini'), data };
      if (data.pairCount === 0) {
        return { run: this.unavailable(meta, 'Token ini hanya menjadi quote di pair DEX, jadi harganya belum dihitung'), data };
      }
      const notes = new RunNotes();
      for (const field of data.missingFields) notes.fail(field, 'Data pasar tidak tersedia atau di luar jangkauan');
      return { run: this.finish(meta, notes), data };
    } catch (error) {
      return { run: this.unavailable(meta, reasonOf(error)), data: null };
    }
  }

  private notErc20Reason(info: IndexedTokenInfo | null, onchain: OnchainState): string | null {
    if (info?.type && info.type !== 'ERC-20') return `Address ini token ${info.type}, bukan ERC-20.`;
    if (onchain.notErc20) return 'Kontrak ini tidak punya fungsi totalSupply() dan decimals(), jadi bukan token ERC-20.';
    return null;
  }

  // -------------------------------------------------------------------------
  // State on-chain pada blok yang dipatok
  // -------------------------------------------------------------------------

  private async collectOnchain(token: string, candidates: IndexedHolder[], creationTxHash: string | null): Promise<OnchainState> {
    const rpc = this.providers.rpc;
    const meta = this.meta(RUN_KEYS.rpc, rpc.name, 'rpc', 'token.state', token);
    const notes = new RunNotes();
    const state: OnchainState = {
      run: this.unavailable(meta, 'RPC belum dipanggil'),
      failure: null,
      blockNumber: null,
      blockTimestamp: null,
      fetchedAt: meta.startedAt,
      name: null,
      symbol: null,
      decimals: null,
      totalSupply: null,
      notErc20: false,
      owner: { kind: 'none' },
      proxy: { kind: 'none' },
      holders: null,
      deployment: null,
    };
    const fatal = (reason: string, failure = `Data on-chain tidak bisa dibaca: ${reason}`): OnchainState => ({
      ...state,
      run: { ...this.unavailable(meta, reason), blockFrom: state.blockNumber, blockTo: state.blockNumber },
      failure,
    });

    // Langkah wajib: chain yang benar, blok yang dipatok, dan kode kontrak.
    let code: string;
    try {
      const chainId = await rpc.chainId();
      if (chainId !== this.definition.evmChainId) {
        return fatal(`RPC mengembalikan chain ID ${chainId}, seharusnya ${this.definition.evmChainId}`);
      }
      const blockNumber = await this.pinnedBlockNumber();
      state.blockNumber = blockNumber;
      state.fetchedAt = this.now();
      const block = await rpc.getBlock(blockNumber);
      if (!block) return fatal(`Blok ${blockNumber} tidak ditemukan`);
      state.blockTimestamp = block.timestamp;
      code = await rpc.getCode(token, blockNumber);
    } catch (error) {
      return fatal(reasonOf(error));
    }
    const block = state.blockNumber!;
    if (code === '0x') {
      return {
        ...state,
        run: { ...this.finish(meta, notes), blockFrom: block, blockTo: block },
        failure: `Address ini bukan kontrak di ${this.definition.name} pada blok ${block}.`,
      };
    }

    const [name, symbol, decimals, supply, owner] = await Promise.all([
      this.callAt(token, SELECTORS.name, block),
      this.callAt(token, SELECTORS.symbol, block),
      this.callAt(token, SELECTORS.decimals, block),
      this.callAt(token, SELECTORS.totalSupply, block),
      this.callAt(token, SELECTORS.owner, block),
    ]);
    state.name = this.decodeField(name, 'token.name', 'name()', notes, (data) => nonEmpty(decodeString(data)));
    state.symbol = this.decodeField(symbol, 'token.symbol', 'symbol()', notes, (data) => nonEmpty(decodeString(data)));
    state.decimals = this.decodeField(decimals, 'token.decimals', 'decimals()', notes, (data) => {
      const value = decodeUint256(data);
      if (value > 255n) throw new AbiDecodeError('decimals() di luar 0–255');
      return Number(value);
    });
    state.totalSupply = this.decodeField(supply, 'token.totalSupply', 'totalSupply()', notes, decodeUint256);
    state.notErc20 = isAbsent(supply) && isAbsent(decimals);
    state.owner = this.ownerState(owner, notes);
    state.proxy = await this.proxyState(token, code, block, notes);
    state.holders = await this.verifiedHolders(token, candidates, state.totalSupply, block, notes);
    state.deployment = await this.verifiedDeployment(token, creationTxHash, notes);

    return { ...state, run: { ...this.finish(meta, notes), blockFrom: block, blockTo: block } };
  }

  private async callAt(to: string, data: string, block: number): Promise<CallOutcome> {
    try {
      return { kind: 'ok', data: await this.providers.rpc.call({ to, data }, block) };
    } catch (error) {
      if (error instanceof RpcRevertError) return { kind: 'reverted' };
      return { kind: 'error', reason: reasonOf(error) };
    }
  }

  private decodeField<T>(
    outcome: CallOutcome,
    field: string,
    fn: string,
    notes: RunNotes,
    decode: (data: string) => T | null,
  ): T | null {
    if (outcome.kind === 'error') {
      notes.fail(field, outcome.reason);
      return null;
    }
    if (outcome.kind === 'reverted' || outcome.data === '0x') {
      notes.fail(field, `${fn} tidak tersedia di kontrak`);
      return null;
    }
    try {
      const value = decode(outcome.data);
      if (value === null) notes.fail(field, `${fn} kosong`);
      return value;
    } catch (error) {
      notes.fail(field, reasonOf(error));
      return null;
    }
  }

  private ownerState(outcome: CallOutcome, notes: RunNotes): OwnerState {
    if (outcome.kind === 'error') {
      notes.fail('contract.owner', outcome.reason);
      return { kind: 'error', reason: outcome.reason };
    }
    if (outcome.kind === 'reverted' || outcome.data === '0x') return { kind: 'none' };
    try {
      const owner = decodeAddress(outcome.data);
      return owner === ZERO_ADDRESS ? { kind: 'renounced' } : { kind: 'active', owner };
    } catch {
      // owner() ada tapi tidak mengembalikan address: bukan pola owner standar.
      return { kind: 'none' };
    }
  }

  private async proxyState(token: string, code: string, block: number, notes: RunNotes): Promise<ProxyState> {
    try {
      const [implementationSlot, beaconSlot] = await Promise.all([
        this.providers.rpc.getStorageAt(token, EIP1967_SLOTS.implementation, block),
        this.providers.rpc.getStorageAt(token, EIP1967_SLOTS.beacon, block),
      ]);
      const implementation = decodeSlotAddress(implementationSlot);
      if (implementation) return { kind: 'eip1967', implementation };
      const beacon = decodeSlotAddress(beaconSlot);
      if (beacon) return { kind: 'beacon', beacon };
    } catch (error) {
      const reason = reasonOf(error);
      notes.fail('contract.proxy', reason);
      return { kind: 'error', reason };
    }
    const clone = minimalProxyTarget(code);
    return clone ? { kind: 'eip1167', implementation: clone } : { kind: 'none' };
  }

  /**
   * Saldo holder kandidat dari indexer dibaca ulang lewat `balanceOf` pada
   * blok snapshot. Bila satu saja gagal, daftar holder tidak disimpan supaya
   * peringkat dan konsentrasi tidak menyesatkan.
   */
  private async verifiedHolders(
    token: string,
    candidates: IndexedHolder[],
    totalSupply: bigint | null,
    block: number,
    notes: RunNotes,
  ): Promise<OnchainState['holders']> {
    if (candidates.length === 0) return null;
    if (totalSupply === null) {
      notes.fail('holders', 'Total supply tidak tersedia, porsi holder tidak bisa dihitung');
      return null;
    }
    const { addresses, invalid } = dedupeAddresses('evm', candidates.map((holder) => holder.address));
    if (invalid.length > 0) {
      notes.fail('holders', 'Indexer mengirim address holder yang tidak valid');
      return null;
    }
    const byNormalized = new Map(candidates.map((holder) => [normalizeAddress('evm', holder.address), holder]));
    const callDatas = addresses.map((holder) => encodeBalanceOf(holder.address));
    const outcomes =
      (await this.callManyViaMulticall(token, callDatas, block)) ??
      (await mapLimit(callDatas, this.concurrency, (data) => this.callAt(token, data, block)));
    const balances: bigint[] = [];
    for (const outcome of outcomes) {
      if (outcome.kind !== 'ok' || outcome.data === '0x') {
        notes.fail('holders', outcome.kind === 'error' ? outcome.reason : 'balanceOf() tidak tersedia di kontrak');
        return null;
      }
      try {
        balances.push(decodeUint256(outcome.data));
      } catch (error) {
        notes.fail('holders', reasonOf(error));
        return null;
      }
    }
    const distribution = distributeHolders(
      addresses.map((holder, index) => {
        const source = byNormalized.get(holder.normalized)!;
        return { address: holder.address, isContract: source.isContract, labels: source.labels, balance: balances[index] };
      }),
      totalSupply,
    );
    if (!distribution.ok) {
      notes.fail('holders', distribution.reason);
      return null;
    }
    return { holders: distribution.holders, concentration: distribution.concentration };
  }

  /**
   * Banyak `eth_call` ke satu kontrak dalam satu request lewat Multicall3,
   * supaya tidak cepat kena batas rate RPC publik. `null` bila Multicall3
   * tidak ada atau kodenya bukan yang kanonik; pemanggil lalu memakai
   * `eth_call` satu per satu.
   */
  private async callManyViaMulticall(target: string, callDatas: string[], block: number): Promise<CallOutcome[] | null> {
    const multicall = this.multicall;
    if (!multicall || callDatas.length === 0) return null;
    try {
      const code = await this.providers.rpc.getCode(multicall.address, block);
      if (code === '0x' || sha256Hex(code) !== multicall.codeSha256) return null;
      const outcomes: CallOutcome[] = [];
      for (let start = 0; start < callDatas.length; start += MULTICALL_CHUNK) {
        const chunk = callDatas.slice(start, start + MULTICALL_CHUNK);
        const raw = await this.providers.rpc.call(
          { to: multicall.address, data: encodeAggregate3(chunk.map((callData) => ({ target, callData }))) },
          block,
        );
        const results = decodeAggregate3(raw);
        if (results.length !== chunk.length) return null;
        outcomes.push(
          ...results.map((result): CallOutcome => (result.success ? { kind: 'ok', data: result.returnData } : { kind: 'reverted' })),
        );
      }
      return outcomes;
    } catch (error) {
      if (error instanceof RpcRevertError || error instanceof AbiDecodeError) return null;
      if (error instanceof ProviderError) return callDatas.map(() => ({ kind: 'error', reason: error.reason }));
      throw error;
    }
  }

  /**
   * Tx pembuatan dari explorer diverifikasi lewat receipt RPC: tx harus
   * langsung membuat kontrak ini, atau (lewat factory) memancarkan event dari
   * kontrak ini. Deployer adalah pengirim tx tersebut.
   */
  private async verifiedDeployment(
    token: string,
    creationTxHash: string | null,
    notes: RunNotes,
  ): Promise<OnchainState['deployment']> {
    if (!creationTxHash) return null;
    let txHash: string;
    try {
      txHash = normalizeTxHash('evm', creationTxHash);
    } catch {
      notes.fail('token.deployment', 'Hash tx pembuatan dari explorer tidak valid');
      return null;
    }
    try {
      const receipt = await this.providers.rpc.getTransactionReceipt(txHash);
      if (!receipt) {
        notes.fail('token.deployment', 'Tx pembuatan tidak ditemukan di RPC; node non-archive sering tidak menyimpan indeks tx lama');
        return null;
      }
      const createsToken =
        receipt.contractAddress?.toLowerCase() === token || receipt.logs.some((log) => log.address.toLowerCase() === token);
      if (!createsToken) {
        notes.fail('token.deployment', 'Tx pembuatan dari explorer tidak terbukti membuat token ini');
        return null;
      }
      let deployedAt: Date | null = null;
      try {
        deployedAt = (await this.providers.rpc.getBlock(receipt.blockNumber))?.timestamp ?? null;
      } catch (error) {
        notes.fail('token.deployedAt', reasonOf(error));
      }
      return { deployer: receipt.from, txHash, deployedAt };
    } catch (error) {
      notes.fail('token.deployment', reasonOf(error));
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Smoke test
  // -------------------------------------------------------------------------

  /**
   * Cek semua provider chain ini dengan token contoh. Status `validated` hanya
   * bila RPC, explorer, indexer, dan data pasar lolos; `experimental` bila RPC
   * lolos tapi sumber data lain belum; `planned` bila RPC gagal.
   */
  async smokeTest(): Promise<SmokeTestReport> {
    const { rpc, explorer, indexer, market } = this.providers;
    const sample = this.definition.smokeTestToken;
    const checks: SmokeCheck[] = [];
    const step = async (code: string, provider: string, level: SmokeCheck['level'], run: () => Promise<string>) => {
      try {
        checks.push({ code, provider, level, ok: true, detail: await run() });
        return true;
      } catch (error) {
        const detail = error instanceof SmokeFailure ? error.message : reasonOf(error);
        checks.push({ code, provider, level, ok: false, detail });
        return false;
      }
    };
    const skipped = (code: string, provider: string, level: SmokeCheck['level'], detail: string) =>
      checks.push({ code, provider, level, ok: false, detail });

    await step('rpc.chain_id', rpc.name, 'rpc', async () => {
      const chainId = await rpc.chainId();
      if (chainId !== this.definition.evmChainId) {
        throw new SmokeFailure(`Chain ID ${chainId}, seharusnya ${this.definition.evmChainId}`);
      }
      return `Chain ID ${chainId}`;
    });

    let head: EvmBlock | null = null;
    await step('rpc.head', rpc.name, 'rpc', async () => {
      const number = await this.pinnedBlockNumber();
      head = await rpc.getBlock(number);
      if (!head) throw new SmokeFailure(`Blok ${number} tidak ditemukan`);
      const ageMs = this.now().getTime() - head.timestamp.getTime();
      if (ageMs > this.maxHeadAgeMs) {
        throw new SmokeFailure(`Blok terbaru ${number} sudah ${Math.round(ageMs / 60_000)} menit, node tertinggal`);
      }
      return `Blok ${number} (${this.confirmations} blok di belakang terbaru), umur ${Math.max(0, Math.round(ageMs / 1000))} detik`;
    });

    const latest = head as EvmBlock | null;
    if (latest) {
      const txHash = await this.findRecentTransaction(latest);
      if (txHash) {
        await step('rpc.transaction', rpc.name, 'rpc', async () => {
          const [tx, receipt] = await Promise.all([rpc.getTransaction(txHash), rpc.getTransactionReceipt(txHash)]);
          if (!tx || !receipt) throw new SmokeFailure('Transaksi atau receipt tidak ditemukan');
          return `Transaksi dan receipt terbaca di blok ${receipt.blockNumber}`;
        });
        await step('rpc.trace', rpc.name, 'optional', async () => {
          await rpc.traceTransaction(txHash);
          return 'debug_traceTransaction tersedia';
        });
      } else {
        skipped('rpc.transaction', rpc.name, 'rpc', 'Tidak ada transaksi di 5 blok terakhir');
      }
      await step('rpc.logs', rpc.name, 'rpc', async () => {
        // Difilter per kontrak seperti pemakaian sebenarnya (log transfer token);
        // banyak RPC publik menolak eth_getLogs tanpa filter address.
        const fromBlock = Math.max(0, latest.number - 9);
        const logs = await rpc.getLogs({ address: sample.address, fromBlock, toBlock: latest.number });
        return `${logs.length} log token contoh di blok ${fromBlock}–${latest.number}`;
      });
      await step('rpc.call', rpc.name, 'rpc', async () => {
        const symbol = decodeString(await rpc.call({ to: sample.address, data: SELECTORS.symbol }, latest.number));
        if (symbol !== sample.symbol) throw new SmokeFailure(`symbol() token contoh ${symbol}, seharusnya ${sample.symbol}`);
        return `symbol() token contoh: ${symbol}`;
      });
    } else {
      for (const code of ['rpc.transaction', 'rpc.logs', 'rpc.call']) {
        skipped(code, rpc.name, 'rpc', 'Dilewati karena blok terbaru tidak terbaca');
      }
    }

    if (explorer) {
      await step('explorer.contract', explorer.name, 'data', async () => {
        const info = await explorer.getContract(sample.address);
        if (!info?.isContract) throw new SmokeFailure('Explorer tidak mengenali token contoh sebagai kontrak');
        return `Token contoh dikenali, terverifikasi: ${info.verified === null ? 'tidak diketahui' : info.verified ? 'ya' : 'tidak'}`;
      });
    } else {
      skipped('explorer.contract', NOT_CONFIGURED, 'data', 'Belum ada explorer untuk chain ini');
    }
    if (indexer) {
      await step('indexer.holders', indexer.name, 'data', async () => {
        const info = await indexer.getTokenInfo(sample.address);
        if (!info) throw new SmokeFailure('Indexer tidak mengenali token contoh');
        const holders = await indexer.getTopHolders(sample.address);
        if (holders.length === 0) throw new SmokeFailure('Indexer tidak mengembalikan holder token contoh');
        return `${holders.length} holder teratas terbaca dari ${info.holderCount ?? '?'} holder`;
      });
    } else {
      skipped('indexer.holders', NOT_CONFIGURED, 'data', 'Belum ada indexer untuk chain ini');
    }
    if (market) {
      await step('market.pairs', market.name, 'data', async () => {
        const data = await market.getTokenMarket(sample.address);
        if (data.poolCount === 0) throw new SmokeFailure('Tidak ada pool untuk token contoh; id chain mungkin salah');
        return `${data.poolCount} pool memuat token contoh, ${data.pairCount} sebagai base`;
      });
    } else {
      skipped('market.pairs', NOT_CONFIGURED, 'data', 'Belum ada sumber data pasar untuk chain ini');
    }

    const passed = (level: SmokeCheck['level']) => checks.filter((check) => check.level === level).every((check) => check.ok);
    const status = !passed('rpc') ? 'planned' : passed('data') ? 'validated' : 'experimental';
    return { chainId: this.chainId, status, checks, testedAt: this.now() };
  }

  /** Hash transaksi dari blok terbaru, mundur sampai 5 blok bila kosong. */
  private async findRecentTransaction(head: EvmBlock): Promise<string | null> {
    let block: EvmBlock | null = head;
    for (let step = 0; step < 5 && block; step++) {
      if (block.transactionHashes.length > 0) return block.transactionHashes[0];
      if (block.number === 0) return null;
      try {
        block = await this.providers.rpc.getBlock(block.number - 1);
      } catch {
        return null;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Pencatatan run
  // -------------------------------------------------------------------------

  private meta(key: string, provider: string, kind: ProviderKind, operation: string, subject: string): RunMeta {
    return { key, provider, kind, operation, subject, startedAt: this.now() };
  }

  private unavailable(meta: RunMeta, reason: string): ProviderRunRecord {
    return this.record(meta, 'unavailable', reason, []);
  }

  private finish(meta: RunMeta, notes: RunNotes): ProviderRunRecord {
    return this.record(meta, notes.missing.length > 0 ? 'partial' : 'complete', notes.errorReason, notes.missing);
  }

  private record(meta: RunMeta, status: DataStatus, errorReason: string | null, missingFields: string[]): ProviderRunRecord {
    return {
      key: meta.key,
      provider: meta.provider,
      kind: meta.kind,
      operation: meta.operation,
      subject: meta.subject,
      status,
      errorReason,
      missingFields: [...missingFields],
      blockFrom: null,
      blockTo: null,
      startedAt: meta.startedAt,
      fetchedAt: this.now(),
    };
  }
}

function sha256Hex(hex: string): string {
  return createHash('sha256').update(Buffer.from(hex.slice(2), 'hex')).digest('hex');
}

function nonEmpty(value: string): string | null {
  return value === '' ? null : value;
}

function isAbsent(outcome: CallOutcome): boolean {
  return outcome.kind === 'reverted' || (outcome.kind === 'ok' && outcome.data === '0x');
}

function withoutMeta(data: TokenMarketData) {
  const { poolCount: _poolCount, pairCount: _pairCount, missingFields: _missingFields, ...market } = data;
  return market;
}
