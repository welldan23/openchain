/**
 * Alur penuh tanpa jaringan sungguhan: RPC, Blockscout, dan Dexscreener palsu
 * lewat HTTP → adapter EVM → ingest ke database → dibaca lewat endpoint API.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ChainRegistry } from '../src/chains/chain-registry.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { TokenIngestionService, type IngestionResult } from '../src/ingestion/token-ingestion.service.js';
import { READ_ONLY_RPC_METHODS } from '../src/providers/evm-rpc.provider.js';
import { SnapshotRecorder } from '../src/snapshots/snapshot-recorder.service.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';
import { fakeFetch, jsonResponse, type RecordedRequest } from './support/fake-fetch.js';

const TOKEN = '0x008Df4b3E857D06c4603Aeb11F267ccD32ce2005';
const TOKEN_LOWER = TOKEN.toLowerCase();
const OWNER = '0x5f3ea8ba7b9d1d02cb83ef6c4b0e7fe46b0c2b11';
const DEPLOYER = '0xfbfeaf0da0f2fde5c66df570133ae35f3eb58c9a';
const HOLDER_A = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
const HOLDER_B = '0x1d48963DD8FAdA6aB5C2C7b92Eba81ECC5030270';
const POOL = '0x7F8271c1A7A6A434F33b0BAbc15bF2980a0DCB41';
const DEPLOY_TX = `0x${'cd'.repeat(32)}`;
const BLOCK = 78_900_000;
const DEPLOY_BLOCK = 70_000_000;
const NOW = new Date('2026-10-03T07:00:00Z');
const E18 = 10n ** 18n;

const word = (hex: string) => hex.padStart(64, '0');
const hex = (value: number | bigint) => `0x${value.toString(16)}`;
const abiString = (value: string) => {
  const bytes = Buffer.from(value, 'utf8');
  return `0x${word('20')}${word(bytes.length.toString(16))}${bytes.toString('hex').padEnd(64, '0')}`;
};

const BALANCES: Record<string, bigint> = {
  [HOLDER_A.toLowerCase()]: 400_000_000n * E18,
  [POOL.toLowerCase()]: 250_000_000n * E18,
  [HOLDER_B.toLowerCase()]: 100_000_000n * E18,
};

/** Node JSON-RPC palsu untuk Robinhood Chain. */
function rpc(body: { id: number; method: string; params: unknown[] }): Response {
  const result = (value: unknown) => jsonResponse({ jsonrpc: '2.0', id: body.id, result: value });
  switch (body.method) {
    case 'eth_chainId':
      return result('0x1237');
    case 'eth_blockNumber':
      // Adapter mematok blok 3 blok di belakang blok terbaru.
      return result(hex(BLOCK + 3));
    case 'eth_getBlockByNumber': {
      const number = Number(body.params[0]);
      const time = number === DEPLOY_BLOCK ? new Date('2026-09-09T11:40:00Z') : new Date(NOW.getTime() - 1000);
      return result({ number: hex(number), hash: `0x${word(hex(number).slice(2))}`, timestamp: hex(time.getTime() / 1000), transactions: [] });
    }
    case 'eth_getCode':
      return result('0x6080604052');
    case 'eth_getStorageAt':
      return result(`0x${'0'.repeat(64)}`);
    case 'eth_getTransactionReceipt':
      return result({
        transactionHash: DEPLOY_TX,
        blockNumber: hex(DEPLOY_BLOCK),
        from: DEPLOYER,
        to: null,
        contractAddress: TOKEN_LOWER,
        status: '0x1',
        logs: [],
      });
    case 'eth_call': {
      const { data } = body.params[0] as { data: string };
      const replies: Record<string, string> = {
        '0x06fdde03': abiString('Robinhood'),
        '0x95d89b41': abiString('ROBINHOOD'),
        '0x313ce567': `0x${word('12')}`,
        '0x18160ddd': `0x${word((1_000_000_000n * E18).toString(16))}`,
        '0x8da5cb5b': `0x${word(OWNER.slice(2))}`,
      };
      if (data.startsWith('0x70a08231')) {
        const holder = `0x${data.slice(-40)}`;
        return result(`0x${word((BALANCES[holder] ?? 0n).toString(16))}`);
      }
      return result(replies[data] ?? '0x');
    }
    default:
      return jsonResponse({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'method not found' } });
  }
}

function blockscout(path: string): Response {
  if (path === `/api/v2/addresses/${TOKEN_LOWER}`) {
    return jsonResponse({
      is_contract: true,
      is_verified: true,
      name: 'Robinhood',
      creator_address_hash: DEPLOYER,
      creation_transaction_hash: DEPLOY_TX,
    });
  }
  if (path === `/api/v2/tokens/${TOKEN_LOWER}`) return jsonResponse({ type: 'ERC-20', holders_count: '1250' });
  if (path === `/api/v2/tokens/${TOKEN_LOWER}/holders`) {
    return jsonResponse({
      items: [
        {
          address: {
            hash: HOLDER_A,
            is_contract: false,
            metadata: {
              tags: [
                { tagType: 'name', name: 'Binance: Hot Wallet 20', slug: 'binance-hot-wallet-20' },
                { tagType: 'generic', name: 'Exchange', slug: 'exchange' },
              ],
            },
          },
          value: '1',
        },
        { address: { hash: HOLDER_B, is_contract: false, metadata: null }, value: '1' },
        {
          address: {
            hash: POOL,
            is_contract: true,
            metadata: {
              tags: [
                { tagType: 'protocol', name: 'Uniswap V4', slug: 'uniswap-v4' },
                { tagType: 'generic', name: 'Liquidity Pool', slug: 'liquidity-pool' },
              ],
            },
          },
          value: '1',
        },
      ],
    });
  }
  return jsonResponse({ message: 'Not found' }, 404);
}

function route(request: RecordedRequest): Response {
  const url = new URL(request.url);
  if (request.url === 'https://rpc.mainnet.chain.robinhood.com') return rpc(request.body as never);
  if (url.host === 'robinhoodchain.blockscout.com') return blockscout(url.pathname);
  if (url.host === 'api.dexscreener.com') {
    return jsonResponse([
      {
        chainId: 'robinhood',
        baseToken: { address: TOKEN },
        quoteToken: { address: '0x0000000000000000000000000000000000000000' },
        priceUsd: '0.001519',
        priceChange: { h24: -17.49 },
        liquidity: { usd: 118130.6 },
        volume: { h24: 79649.31 },
        txns: { h24: { buys: 234, sells: 149 } },
        marketCap: 1519103,
        fdv: 1519103,
      },
    ]);
  }
  return jsonResponse({}, 404);
}

describe('Ingest token lalu baca lewat API', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let result: IngestionResult;
  const fake = fakeFetch([], route);

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    const database = db as unknown as Database;
    const registry = new ChainRegistry({}, fake.http, undefined, { now: () => NOW });
    result = await new TokenIngestionService(database, new SnapshotRecorder(database), registry).ingest('robinhood', TOKEN);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(db)
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(NOW.getTime() + 5 * 60_000) })
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  const url = (endpoint: string) => `/api/tokens/robinhood/${TOKEN}/${endpoint}`;

  it('hanya memanggil method RPC baca', () => {
    const methods = fake.requests
      .filter((recorded) => recorded.url === 'https://rpc.mainnet.chain.robinhood.com')
      .map((recorded) => (recorded.body as { method: string }).method);
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((method) => READ_ONLY_RPC_METHODS.has(method))).toBe(true);
  });

  it('ingest membuat snapshot lengkap pada blok yang dipatok', () => {
    expect(result).toMatchObject({
      failure: null,
      snapshot: { blockNumber: BLOCK, dataStatus: 'complete' },
      holdersStored: 3,
      checks: { fail: 0, warn: 1, unknown: 6, pass: 2 },
    });
  });

  it('ringkasan token memakai data on-chain, pasar, dan explorer', async () => {
    const { body } = await request(app.getHttpServer()).get(url('summary')).expect(200);
    expect(body).toMatchObject({
      chain: { id: 'robinhood', explorerUrl: 'https://robinhoodchain.blockscout.com', supportStatus: 'planned' },
      token: {
        address: TOKEN,
        name: 'Robinhood',
        symbol: 'ROBINHOOD',
        decimals: 18,
        totalSupply: '1000000000',
        deployer: DEPLOYER,
        deployTxHash: DEPLOY_TX,
        deployedAt: '2026-09-09T11:40:00.000Z',
        sourceVerified: true,
      },
      snapshot: { blockNumber: BLOCK, collectedStatus: 'complete', dataStatus: 'complete' },
      market: { priceUsd: 0.001519, liquidityUsd: 118130.6, holderCount: 1250, txCount24h: 383 },
      concentration: { top10Pct: 75, top50Pct: 75 },
      risk: { score: null, level: 'unknown' },
    });
    expect(body.snapshot.sources.map((source: { provider: string; kind: string }) => [source.provider, source.kind])).toEqual([
      ['robinhood-rpc', 'rpc'],
      ['blockscout', 'explorer'],
      ['blockscout', 'indexed_data'],
      ['dexscreener', 'market_data'],
    ]);
  });

  it('holder diurutkan dari saldo on-chain dan membawa label Blockscout', async () => {
    const { body } = await request(app.getHttpServer()).get(url('holders')).expect(200);
    expect(body.holders.map((holder: { rank: number; address: string; sharePct: number }) => [holder.rank, holder.address, holder.sharePct])).toEqual([
      [1, HOLDER_A, 40],
      [2, POOL, 25],
      [3, HOLDER_B, 10],
    ]);
    expect(body.holders[0].labels).toEqual([
      expect.objectContaining({ type: 'exchange', name: 'Binance: Hot Wallet 20', source: 'external', sourceName: 'Blockscout' }),
    ]);
    expect(body.holders[1].labels).toEqual([expect.objectContaining({ type: 'liquidity_pool', name: 'Uniswap V4' })]);
  });

  it('cek kontrak menyertakan bukti yang bisa dibuka di explorer', async () => {
    const { body } = await request(app.getHttpServer()).get(url('contract-checks')).expect(200);
    expect(body.summary).toEqual([
      { status: 'warn', count: 1 },
      { status: 'unknown', count: 6 },
      { status: 'pass', count: 2 },
    ]);
    const ownership = body.checks.find((check: { code: string }) => check.code === 'ownership');
    expect(ownership).toMatchObject({ status: 'warn', classification: 'verified_fact' });
    expect(ownership.evidence).toEqual([
      expect.objectContaining({
        classification: 'verified_fact',
        blockNumber: BLOCK,
        method: 'owner()',
        contractAddress: TOKEN,
        explorerUrl: `https://robinhoodchain.blockscout.com/block/${BLOCK}`,
      }),
    ]);
    const verified = body.checks.find((check: { code: string }) => check.code === 'verified');
    expect(verified.evidence[0]).toMatchObject({ classification: 'external_label', explorerUrl: null });
  });

  it('bukti transaksi mencantumkan pemeriksaan yang didukungnya', async () => {
    const { body } = await request(app.getHttpServer()).get(url('evidence')).expect(200);
    expect(body.findings).toEqual([]);
    expect(body.evidence.map((item: { relatedChecks: string[] }) => item.relatedChecks).sort()).toEqual([
      ['ownership'],
      ['proxy'],
      ['verified'],
    ]);
  });
});
