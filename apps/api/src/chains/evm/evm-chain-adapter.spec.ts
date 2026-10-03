import {
  ProviderError,
  RpcRevertError,
  type BlockTag,
  type EvmBlock,
  type EvmReceipt,
  type ExplorerContractInfo,
  type ExplorerProvider,
  type IndexedDataProvider,
  type IndexedHolder,
  type IndexedTokenInfo,
  type MarketDataProvider,
  type RpcProvider,
  type TokenMarketData,
} from '../../providers/provider.types.js';
import { createHash } from 'node:crypto';
import { decodeAggregate3Calls, encodeAggregate3Result } from '../../../test/support/multicall.js';
import { EVM_CHAIN_DEFINITIONS } from '../chain-definitions.js';
import { EIP1967_SLOTS, SELECTORS } from './abi.js';
import { EvmChainAdapter, type EvmAdapterOptions, type EvmAdapterProviders } from './evm-chain-adapter.js';

const ROBINHOOD = EVM_CHAIN_DEFINITIONS.find((definition) => definition.id === 'robinhood')!;
const TOKEN = '0x008df4b3e857d06c4603aeb11f267ccd32ce2005';
const HOLDER_A = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
const HOLDER_B = '0x1d48963DD8FAdA6aB5C2C7b92Eba81ECC5030270';
const HOLDER_C = '0x3f9a8345729eA842708E080e238C92731e5699b8';
const DEPLOYER = '0xfbfeaf0da0f2fde5c66df570133ae35f3eb58c9a';
const DEPLOY_TX = `0x${'cd'.repeat(32)}`;
const NOW = new Date('2026-10-03T07:00:00Z');
const HEAD = 78_900_000;
const E18 = 10n ** 18n;

const word = (hex: string) => hex.padStart(64, '0');
const uint = (value: bigint) => `0x${word(value.toString(16))}`;
const address = (value: string) => `0x${word(value.slice(2).toLowerCase())}`;
const text = (value: string) => {
  const bytes = Buffer.from(value, 'utf8');
  return `0x${word('20')}${word(bytes.length.toString(16))}${bytes.toString('hex').padEnd(64, '0')}`;
};
const balanceOf = (holder: string) => `${SELECTORS.balanceOf}${word(holder.slice(2).toLowerCase())}`;

/** Multicall3 palsu: kodenya sengaja pendek, hash-nya diberikan ke adapter. */
const MULTICALL = '0x00000000000000000000000000000000000ca113';
const MULTICALL_CODE = '0x6001600101';
const MULTICALL_OPTION: EvmAdapterOptions['multicall'] = {
  address: MULTICALL,
  codeSha256: createHash('sha256').update(Buffer.from(MULTICALL_CODE.slice(2), 'hex')).digest('hex'),
};

type CallReply = string | 'revert' | ProviderError;

/** RPC palsu yang mencatat setiap panggilan beserta bloknya. */
class FakeRpc implements RpcProvider {
  readonly name = 'robinhood-rpc';
  chain = 4663;
  head = HEAD;
  headTime = new Date(NOW.getTime() - 2_000);
  code = '0x6080604052';
  calls = new Map<string, CallReply>();
  storage = new Map<string, string>();
  receipts = new Map<string, EvmReceipt>();
  blockTimes = new Map<number, Date>();
  failHead: ProviderError | null = null;
  multicallCode = MULTICALL_CODE;
  multicallError: ProviderError | null = null;
  readonly log: string[] = [];

  async chainId() {
    this.log.push('eth_chainId');
    return this.chain;
  }
  async blockNumber() {
    this.log.push('eth_blockNumber');
    if (this.failHead) throw this.failHead;
    return this.head;
  }
  async getBlock(block: BlockTag): Promise<EvmBlock | null> {
    const number = block === 'latest' ? this.head : block;
    return {
      number,
      hash: `0x${word(number.toString(16))}`,
      timestamp: this.blockTimes.get(number) ?? this.headTime,
      transactionHashes: [`0x${'aa'.repeat(32)}`],
    };
  }
  async getTransaction(hash: string) {
    return { hash, from: DEPLOYER, to: TOKEN, blockNumber: this.head, input: '0x' };
  }
  async getTransactionReceipt(hash: string) {
    return this.receipts.get(hash) ?? null;
  }
  async getLogs() {
    return [];
  }
  async call(request: { to: string; data: string }, block: BlockTag) {
    this.log.push(`eth_call@${block}`);
    if (request.to === MULTICALL) {
      if (this.multicallError) throw this.multicallError;
      return encodeAggregate3Result(
        decodeAggregate3Calls(request.data).map(({ callData }) => {
          const reply = this.calls.get(callData);
          return typeof reply === 'string' && reply !== 'revert'
            ? { success: true, returnData: reply }
            : { success: false, returnData: '0x' };
        }),
      );
    }
    const reply = this.calls.get(request.data);
    if (reply === undefined || reply === 'revert') throw new RpcRevertError(this.name);
    if (reply instanceof ProviderError) throw reply;
    return reply;
  }
  async getCode(address: string, block: BlockTag) {
    this.log.push(`eth_getCode@${block}`);
    return address === MULTICALL ? this.multicallCode : this.code;
  }
  async getStorageAt(_address: string, slot: string, block: BlockTag) {
    this.log.push(`eth_getStorageAt@${block}`);
    return this.storage.get(slot) ?? `0x${'0'.repeat(64)}`;
  }
  async traceTransaction(): Promise<unknown> {
    throw new ProviderError(this.name, 'debug_traceTransaction gagal: method not found (kode -32601)');
  }
}

function world() {
  const rpc = new FakeRpc();
  rpc.calls.set(SELECTORS.name, text('Robinhood'));
  rpc.calls.set(SELECTORS.symbol, text('ROBINHOOD'));
  rpc.calls.set(SELECTORS.decimals, uint(18n));
  rpc.calls.set(SELECTORS.totalSupply, uint(1000n * E18));
  rpc.calls.set(SELECTORS.owner, address('0x0000000000000000000000000000000000000000'));
  rpc.calls.set(balanceOf(HOLDER_A), uint(600n * E18));
  rpc.calls.set(balanceOf(HOLDER_B), uint(300n * E18));
  rpc.calls.set(balanceOf(HOLDER_C), uint(0n));
  rpc.receipts.set(DEPLOY_TX, {
    transactionHash: DEPLOY_TX,
    blockNumber: 70_000_000,
    from: DEPLOYER,
    to: null,
    contractAddress: TOKEN,
    status: 'success',
    logs: [],
  });
  rpc.blockTimes.set(70_000_000, new Date('2026-09-09T11:40:00Z'));
  const headTx = `0x${'aa'.repeat(32)}`;
  rpc.receipts.set(headTx, { transactionHash: headTx, blockNumber: HEAD, from: DEPLOYER, to: TOKEN, contractAddress: null, status: 'success', logs: [] });

  let contract: ExplorerContractInfo | null | ProviderError = {
    isContract: true,
    verified: true,
    contractName: 'Robinhood',
    creatorAddress: DEPLOYER,
    creationTxHash: DEPLOY_TX,
  };
  let tokenInfo: IndexedTokenInfo | null | ProviderError = { type: 'ERC-20', holderCount: 3 };
  let holders: IndexedHolder[] = [
    // Saldo indexer sengaja berbeda: yang dipakai adalah saldo RPC pada blok snapshot.
    { address: HOLDER_B, isContract: false, balanceRaw: '1', labels: [] },
    { address: HOLDER_A, isContract: false, balanceRaw: '2', labels: [{ type: 'exchange', name: 'Binance: Hot Wallet 20' }] },
    { address: HOLDER_C, isContract: true, balanceRaw: '3', labels: [] },
  ];
  let market: TokenMarketData | ProviderError = {
    poolCount: 1,
    pairCount: 1,
    priceUsd: '0.001519',
    priceChange24hPct: '-17.49',
    marketCapUsd: '1519103',
    fdvUsd: '1519103',
    liquidityUsd: '118130.6',
    volume24hUsd: '79649.31',
    txCount24h: 383,
    missingFields: [],
  };

  const explorer: ExplorerProvider & IndexedDataProvider = {
    name: 'blockscout',
    async getContract() {
      rpc.log.push('explorer');
      if (contract instanceof ProviderError) throw contract;
      return contract;
    },
    async getTokenInfo() {
      rpc.log.push('indexer');
      if (tokenInfo instanceof ProviderError) throw tokenInfo;
      return tokenInfo;
    },
    async getTopHolders() {
      return holders;
    },
  };
  const marketProvider: MarketDataProvider = {
    name: 'dexscreener',
    async getTokenMarket() {
      rpc.log.push('market');
      if (market instanceof ProviderError) throw market;
      return market;
    },
  };
  const providers: EvmAdapterProviders = { rpc, explorer, indexer: explorer, market: marketProvider };
  return {
    rpc,
    providers,
    adapter: (overrides: Partial<EvmAdapterProviders> = {}, confirmations = 0) =>
      new EvmChainAdapter(ROBINHOOD, { ...providers, ...overrides }, { now: () => NOW, confirmations, multicall: MULTICALL_OPTION }),
    set: {
      contract: (value: typeof contract) => (contract = value),
      tokenInfo: (value: typeof tokenInfo) => (tokenInfo = value),
      holders: (value: IndexedHolder[]) => (holders = value),
      market: (value: typeof market) => (market = value),
    },
  };
}

describe('EvmChainAdapter.collectToken', () => {
  it('mengumpulkan token lengkap dengan state on-chain pada satu blok', async () => {
    const { rpc, adapter } = world();
    const collection = await adapter().collectToken(` ${TOKEN.toUpperCase().replace('0X', '0x')} `);

    expect(collection.failure).toBeNull();
    expect(collection.blockNumber).toBe(HEAD);
    expect(collection.token).toEqual({
      standard: 'erc20',
      name: 'Robinhood',
      symbol: 'ROBINHOOD',
      decimals: 18,
      totalSupplyRaw: (1000n * E18).toString(),
      sourceVerified: true,
      deployer: DEPLOYER,
      deployTxHash: DEPLOY_TX,
      deployedAt: new Date('2026-09-09T11:40:00Z'),
    });
    expect(collection.market).toEqual({
      priceUsd: '0.001519',
      priceChange24hPct: '-17.49',
      marketCapUsd: '1519103',
      fdvUsd: '1519103',
      liquidityUsd: '118130.6',
      volume24hUsd: '79649.31',
      txCount24h: 383,
    });
    expect(collection.holderCount).toBe(3);
    expect(collection.holders).toEqual([
      expect.objectContaining({ address: HOLDER_A, rank: 1, sharePct: '60.000000', labels: [{ type: 'exchange', name: 'Binance: Hot Wallet 20' }] }),
      expect.objectContaining({ address: HOLDER_B, rank: 2, sharePct: '30.000000' }),
    ]);
    expect(collection.concentration).toEqual({ top10Pct: '90.0000', top50Pct: '90.0000' });

    // Provider off-chain dulu, baru blok dipatok; semua state dibaca pada blok itu.
    const pinned = rpc.log.indexOf('eth_blockNumber');
    for (const source of ['explorer', 'indexer', 'market']) expect(rpc.log.indexOf(source)).toBeLessThan(pinned);
    const stateReads = rpc.log.filter((entry) => entry.includes('@'));
    expect(stateReads.length).toBeGreaterThan(0);
    expect(stateReads.every((entry) => entry.endsWith(`@${HEAD}`))).toBe(true);

    expect(collection.runs.map((run) => [run.key, run.provider, run.kind, run.status])).toEqual([
      ['rpc', 'robinhood-rpc', 'rpc', 'complete'],
      ['explorer', 'blockscout', 'explorer', 'complete'],
      ['indexer', 'blockscout', 'indexed_data', 'complete'],
      ['market', 'dexscreener', 'market_data', 'complete'],
    ]);
    expect(collection.runs[0]).toMatchObject({ blockFrom: HEAD, blockTo: HEAD, subject: TOKEN, operation: 'token.state' });
  });

  it('secara default mematok blok 3 blok di belakang blok terbaru', async () => {
    const { rpc, providers } = world();
    const collection = await new EvmChainAdapter(ROBINHOOD, providers, { now: () => NOW, multicall: MULTICALL_OPTION }).collectToken(TOKEN);
    expect(collection.blockNumber).toBe(HEAD - 3);
    const stateReads = rpc.log.filter((entry) => entry.includes('@'));
    expect(stateReads.length).toBeGreaterThan(0);
    expect(stateReads.every((entry) => entry.endsWith(`@${HEAD - 3}`))).toBe(true);
    expect(collection.runs[0]).toMatchObject({ blockFrom: HEAD - 3, blockTo: HEAD - 3 });
  });

  it('menyusun cek kontrak beserta bukti yang bisa ditelusuri', async () => {
    const { adapter } = world();
    const { checks } = await adapter().collectToken(TOKEN);
    expect(checks.map((check) => [check.code, check.status, check.classification])).toEqual([
      ['verified', 'pass', 'external_label'],
      ['ownership', 'pass', 'verified_fact'],
      ['proxy', 'pass', 'verified_fact'],
      ['tax', 'unknown', null],
      ['blacklist', 'unknown', null],
      ['mint', 'unknown', null],
      ['pause', 'unknown', null],
      ['liquidity-lock', 'unknown', null],
      ['honeypot', 'unknown', null],
    ]);
    const [verified, ownership, proxy] = checks;
    expect(verified.evidence).toEqual([
      expect.objectContaining({ classification: 'external_label', runKey: 'explorer', subject: `${TOKEN}:verified@${HEAD}` }),
    ]);
    expect(ownership.evidence).toEqual([
      expect.objectContaining({
        classification: 'verified_fact',
        runKey: 'rpc',
        blockNumber: HEAD,
        method: 'owner()',
        subject: `${TOKEN}:owner@${HEAD}`,
        explanation: `owner() pada blok ${HEAD} mengembalikan address nol, artinya kepemilikan kontrak sudah dilepas.`,
      }),
    ]);
    expect(proxy.evidence[0]).toMatchObject({ classification: 'verified_fact', blockNumber: HEAD });
  });

  it('menandai owner aktif dan proxy EIP-1967 sebagai perlu perhatian', async () => {
    const { rpc, adapter } = world();
    rpc.calls.set(SELECTORS.owner, address(DEPLOYER));
    rpc.storage.set(EIP1967_SLOTS.implementation, `0x${word('bebebebebebebebebebebebebebebebebebebebe')}`);
    const { checks } = await adapter().collectToken(TOKEN);
    expect(checks[1]).toMatchObject({ status: 'warn', value: 'Owner masih aktif, belum di-renounce' });
    expect(checks[1].description).toContain(DEPLOYER);
    expect(checks[2]).toMatchObject({ status: 'warn', value: 'Proxy upgradeable, logika bisa diganti' });
    expect(checks[2].description).toContain('0xbebebebebebebebebebebebebebebebebebebebe');
  });

  it('owner() yang tidak ada bukan error: cek ownership menjadi unknown tanpa field hilang', async () => {
    const { rpc, adapter } = world();
    rpc.calls.set(SELECTORS.owner, 'revert');
    const collection = await adapter().collectToken(TOKEN);
    expect(collection.checks[1]).toMatchObject({ status: 'unknown', value: 'Tidak ada fungsi owner()', classification: null });
    expect(collection.runs[0].status).toBe('complete');
  });

  it('membaca semua saldo holder lewat satu panggilan Multicall3', async () => {
    const { rpc, adapter } = world();
    const collection = await adapter().collectToken(TOKEN);
    expect(collection.holders).toHaveLength(2);
    // 5 panggilan metadata dan owner, ditambah 1 aggregate3 untuk 3 holder.
    expect(rpc.log.filter((entry) => entry.startsWith('eth_call@'))).toHaveLength(6);
  });

  it.each([
    ['tidak ada', '0x'],
    ['kodenya tidak dikenal', '0x60016002'],
  ])('kembali ke eth_call satu per satu bila Multicall3 %s', async (_case, code) => {
    const { rpc, adapter } = world();
    rpc.multicallCode = code;
    const collection = await adapter().collectToken(TOKEN);
    expect(collection.holders?.map((holder) => holder.address)).toEqual([HOLDER_A, HOLDER_B]);
    expect(rpc.log.filter((entry) => entry.startsWith('eth_call@'))).toHaveLength(8);
  });

  it('tidak menyimpan holder bila Multicall3 kena batas rate', async () => {
    const { rpc, adapter } = world();
    rpc.multicallError = new ProviderError('robinhood-rpc', 'HTTP 429: kena batas rate provider');
    const collection = await adapter().collectToken(TOKEN);
    expect(collection.holders).toBeNull();
    expect(collection.runs[0]).toMatchObject({ status: 'partial', missingFields: ['holders'] });
  });

  it('tidak menyimpan holder bila satu saldo gagal diverifikasi', async () => {
    const { rpc, adapter } = world();
    rpc.multicallCode = '0x';
    rpc.calls.set(balanceOf(HOLDER_B), new ProviderError('robinhood-rpc', 'HTTP 429: kena batas rate provider'));
    const collection = await adapter().collectToken(TOKEN);
    expect(collection.failure).toBeNull();
    expect(collection.holders).toBeNull();
    expect(collection.concentration).toBeNull();
    expect(collection.runs[0]).toMatchObject({
      status: 'partial',
      missingFields: ['holders'],
      errorReason: 'HTTP 429: kena batas rate provider',
    });
  });

  it('mencatat metadata yang tidak tersedia tanpa menebaknya', async () => {
    const { rpc, adapter } = world();
    rpc.calls.set(SELECTORS.name, 'revert');
    rpc.calls.set(SELECTORS.symbol, `0x${'4d4b52'.padEnd(64, '0')}`);
    const collection = await adapter().collectToken(TOKEN);
    expect(collection.token).toMatchObject({ name: null, symbol: 'MKR' });
    expect(collection.runs[0]).toMatchObject({ status: 'partial', missingFields: ['token.name'], errorReason: 'name() tidak tersedia di kontrak' });
  });

  it('tetap membuat snapshot bila explorer diblokir dan token belum punya pair', async () => {
    const { adapter, set } = world();
    const blocked = new ProviderError('blockscout', 'HTTP 403: diblokir proteksi bot (Cloudflare)');
    set.contract(blocked);
    set.tokenInfo(blocked);
    set.market({
      poolCount: 0,
      pairCount: 0,
      priceUsd: null,
      priceChange24hPct: null,
      marketCapUsd: null,
      fdvUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      txCount24h: null,
      missingFields: [],
    });
    const collection = await adapter().collectToken(TOKEN);
    expect(collection.failure).toBeNull();
    expect(collection.runs.map((run) => [run.key, run.status, run.errorReason])).toEqual([
      ['rpc', 'complete', null],
      ['explorer', 'unavailable', 'HTTP 403: diblokir proteksi bot (Cloudflare)'],
      ['indexer', 'unavailable', 'HTTP 403: diblokir proteksi bot (Cloudflare)'],
      ['market', 'unavailable', 'Tidak ada pair DEX untuk token ini'],
    ]);
    expect(collection.checks[0]).toMatchObject({
      code: 'verified',
      status: 'unknown',
      value: 'Explorer tidak tersedia',
      description: 'HTTP 403: diblokir proteksi bot (Cloudflare)',
    });
    expect(collection.token).toMatchObject({ sourceVerified: null, deployer: null, deployTxHash: null });
    expect(collection.holders).toBeNull();
    expect(collection.market).toBeNull();
  });

  it('menjelaskan token yang hanya menjadi quote di pair DEX', async () => {
    const { adapter, set } = world();
    set.market({
      poolCount: 4,
      pairCount: 0,
      priceUsd: null,
      priceChange24hPct: null,
      marketCapUsd: null,
      fdvUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      txCount24h: null,
      missingFields: [],
    });
    const collection = await adapter().collectToken(TOKEN);
    expect(collection.runs[3]).toMatchObject({
      status: 'unavailable',
      errorReason: 'Token ini hanya menjadi quote di pair DEX, jadi harganya belum dihitung',
    });
    expect(collection.market).toBeNull();
  });

  it('mencatat provider yang belum dikonfigurasi sebagai tidak tersedia', async () => {
    const { adapter } = world();
    const collection = await adapter({ explorer: null, indexer: null, market: null }).collectToken(TOKEN);
    expect(collection.runs.slice(1).map((run) => [run.provider, run.status, run.errorReason])).toEqual([
      ['none', 'unavailable', 'Belum ada explorer yang bisa dipakai untuk chain ini'],
      ['none', 'unavailable', 'Belum ada indexer yang bisa dipakai untuk chain ini'],
      ['none', 'unavailable', 'Belum ada sumber data pasar untuk chain ini'],
    ]);
  });

  it('tidak memakai tx pembuatan yang tidak terbukti membuat token ini', async () => {
    const { rpc, adapter } = world();
    rpc.receipts.set(DEPLOY_TX, { ...rpc.receipts.get(DEPLOY_TX)!, contractAddress: HOLDER_C.toLowerCase(), logs: [] });
    const collection = await adapter().collectToken(TOKEN);
    expect(collection.token).toMatchObject({ deployer: null, deployTxHash: null, deployedAt: null });
    expect(collection.runs[0]).toMatchObject({ missingFields: ['token.deployment'] });
  });

  it('menerima token buatan factory bila tx memancarkan event dari token ini', async () => {
    const { rpc, adapter } = world();
    rpc.receipts.set(DEPLOY_TX, {
      ...rpc.receipts.get(DEPLOY_TX)!,
      contractAddress: null,
      logs: [{ address: TOKEN, topics: [], data: '0x', blockNumber: 70_000_000, transactionHash: DEPLOY_TX, logIndex: 3 }],
    });
    const collection = await adapter().collectToken(TOKEN);
    expect(collection.token).toMatchObject({ deployer: DEPLOYER, deployTxHash: DEPLOY_TX });
  });

  it.each([
    ['chain ID RPC salah', (rpc: FakeRpc) => (rpc.chain = 1), 'RPC mengembalikan chain ID 1, seharusnya 4663'],
    ['address bukan kontrak', (rpc: FakeRpc) => (rpc.code = '0x'), `bukan kontrak di Robinhood Chain pada blok ${HEAD}`],
    [
      'RPC tidak menjawab',
      (rpc: FakeRpc) => (rpc.failHead = new ProviderError('robinhood-rpc', 'Tidak ada respons dalam 15 detik')),
      'Tidak ada respons dalam 15 detik',
    ],
    [
      'kontrak bukan ERC-20',
      (rpc: FakeRpc) => {
        rpc.calls.set(SELECTORS.totalSupply, 'revert');
        rpc.calls.set(SELECTORS.decimals, 'revert');
      },
      'bukan token ERC-20',
    ],
  ])('tidak membuat snapshot bila %s', async (_case, arrange, reason) => {
    const { rpc, adapter } = world();
    arrange(rpc);
    const collection = await adapter().collectToken(TOKEN);
    expect(collection.failure).toContain(reason);
    expect(collection.token).toBeNull();
    expect(collection.runs).toHaveLength(4);
  });

  it('menolak token yang menurut indexer bukan ERC-20', async () => {
    const { adapter, set } = world();
    set.tokenInfo({ type: 'ERC-721', holderCount: 10 });
    const collection = await adapter().collectToken(TOKEN);
    expect(collection.failure).toBe('Address ini token ERC-721, bukan ERC-20.');
  });

  it('menolak address dengan format salah sebelum memanggil provider', async () => {
    const { rpc, adapter } = world();
    await expect(adapter().collectToken('0x123')).rejects.toThrow('Format address evm tidak valid');
    expect(rpc.log).toHaveLength(0);
  });
});

describe('EvmChainAdapter.smokeTest', () => {
  function sampleWorld() {
    const context = world();
    const sample = ROBINHOOD.smokeTestToken.address;
    const originalCall = context.rpc.call.bind(context.rpc);
    context.rpc.call = async (request, block) =>
      request.to === sample && request.data === SELECTORS.symbol ? text('WETH') : originalCall(request, block);
    return context;
  }

  it('validated bila RPC, explorer, indexer, dan data pasar lolos', async () => {
    const { adapter } = sampleWorld();
    const report = await adapter().smokeTest();
    expect(report.status).toBe('validated');
    expect(report.checks.map((check) => [check.code, check.ok])).toEqual([
      ['rpc.chain_id', true],
      ['rpc.head', true],
      ['rpc.transaction', true],
      ['rpc.trace', false],
      ['rpc.logs', true],
      ['rpc.call', true],
      ['explorer.contract', true],
      ['indexer.holders', true],
      ['market.pairs', true],
    ]);
    expect(report.checks.find((check) => check.code === 'rpc.trace')).toMatchObject({ level: 'optional' });
  });

  it('experimental bila RPC lolos tapi explorer diblokir', async () => {
    const { adapter, set } = sampleWorld();
    set.contract(new ProviderError('blockscout', 'HTTP 403: diblokir proteksi bot (Cloudflare)'));
    const report = await adapter().smokeTest();
    expect(report.status).toBe('experimental');
    expect(report.checks.find((check) => check.code === 'explorer.contract')).toMatchObject({
      ok: false,
      detail: 'HTTP 403: diblokir proteksi bot (Cloudflare)',
    });
  });

  it('experimental bila chain belum punya explorer', async () => {
    const { adapter } = sampleWorld();
    const report = await adapter({ explorer: null, indexer: null }).smokeTest();
    expect(report.status).toBe('experimental');
  });

  it('planned bila RPC menunjuk chain lain atau node tertinggal', async () => {
    const wrongChain = sampleWorld();
    wrongChain.rpc.chain = 1;
    expect((await wrongChain.adapter().smokeTest()).status).toBe('planned');

    const stale = sampleWorld();
    stale.rpc.headTime = new Date(NOW.getTime() - 60 * 60_000);
    const report = await stale.adapter().smokeTest();
    expect(report.status).toBe('planned');
    expect(report.checks.find((check) => check.code === 'rpc.head')?.detail).toBe(
      `Blok terbaru ${HEAD} sudah 60 menit, node tertinggal`,
    );
  });

  it('gagal bila token contoh tidak cocok, tanda id chain atau RPC salah', async () => {
    const { adapter } = world();
    const report = await adapter().smokeTest();
    expect(report.status).toBe('planned');
    expect(report.checks.find((check) => check.code === 'rpc.call')?.ok).toBe(false);
  });
});
