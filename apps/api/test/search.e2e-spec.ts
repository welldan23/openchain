import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import * as schema from '../src/database/schema/index.js';
import { FundFlowIngestionService } from '../src/flows/fund-flow-ingestion.service.js';
import type { AddressFlowCollection, KindCoverage } from '../src/flows/fund-flow.types.js';
import { createTestDatabase, seedToken, type TestDatabase } from './support/database.js';

const TOKEN = '0x' + 'Ab'.repeat(20);
const WALLET = '0x' + 'c1'.repeat(20);
const EXCHANGE = '0x' + 'e1'.repeat(20);
const FUNDER = '0x' + 'f1'.repeat(20);
const TX = `0x${'7d'.repeat(32)}`;
const NOW = new Date('2026-10-03T05:00:00Z');
const covered: KindCoverage = { failure: null, exhausted: true, pages: 1, oldest: null, skipped: null };

function scanOf(chainId: string, address: string): AddressFlowCollection {
  const at = new Date('2026-10-01T00:00:00Z');
  return {
    chainId,
    address,
    fetchedAt: NOW,
    runs: [],
    head: { blockNumber: 1_000, timestamp: NOW },
    nativeTransfers: [{ txHash: TX, kind: 'transaction', tracePath: '', from: FUNDER, to: address, amountRaw: '5', blockNumber: 700, timestamp: at }],
    tokenTransfers: [],
    coverage: { native: covered, internal: covered, tokens: covered },
    scan: {
      blockFrom: 0,
      blockTo: 1_000,
      windowFrom: at,
      windowTo: NOW,
      nativeScanned: true,
      tokensScanned: true,
      internalScanned: true,
      status: 'complete',
      statusReason: null,
      missingFields: [],
    },
    partyLabels: [],
    failure: null,
  };
}

interface ResultBody {
  id: string;
  kind: string;
  title: string;
  chain: string | null;
  chains: string[];
  href: string;
  matchedBy: string;
  label: { type: string; source: string } | null;
  meta: Record<string, unknown> | null;
}

describe('GET /api/search', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    await seedToken(db, { address: TOKEN });
    const ingestion = new FundFlowIngestionService(db as unknown as Database);
    // Wallet yang sama dipindai di Ethereum dan Base; transaksi yang sama hash-nya hanya di Ethereum.
    await ingestion.persist(scanOf('ethereum', WALLET), 'evm');
    await ingestion.persist({ ...scanOf('base', WALLET), nativeTransfers: [] }, 'evm');
    await ingestion.persist({ ...scanOf('base', EXCHANGE), nativeTransfers: [] }, 'evm');
    const [exchange] = await db
      .select()
      .from(schema.addresses)
      .where(and(eq(schema.addresses.chainId, 'base'), eq(schema.addresses.addressNormalized, EXCHANGE)));
    await db.insert(schema.labels).values([
      { addressId: exchange.id, labelType: 'exchange', name: 'Bybit: Hot Wallet 6', source: 'external', sourceName: 'Blockscout', classification: 'external_label' },
      { addressId: exchange.id, labelType: 'whale', name: 'Paus Bybit', source: 'heuristic', sourceName: 'OpenChain heuristic', classification: 'heuristic', confidence: '0.400' },
    ]);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(db)
      .overrideProvider(CLOCK)
      .useValue({ now: () => NOW })
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  const search = async (query: string) => (await request(app.getHttpServer()).get(`/api/search${query}`).expect(200)).body;

  it('teks: mencari nama dan simbol token lewat awalan kata, dengan ringkasan snapshot terbaru', async () => {
    const body = await search('?q=nebu');
    expect(body).toMatchObject({ query: 'nebu', queryKind: 'text', total: 1 });
    expect(body.results[0]).toMatchObject({
      kind: 'token',
      title: 'Nebula Finance (NBLA)',
      chain: 'robinhood',
      href: `/token/robinhood/${TOKEN}`,
      matchedBy: 'Nama mengandung "nebu"',
      meta: { kind: 'token', riskLevel: 'high' },
    });
    expect(body.results[0].meta.snapshotAt).not.toBeNull();
    const exact = await search('?q=NBLA');
    expect(exact.results[0].matchedBy).toBe('Nama persis "Nebula Finance (NBLA)"');
  });

  it('teks: address berlabel ikut dicari, label utama eksternal beserta sumbernya', async () => {
    const body = await search('?q=bybit%20hot');
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      kind: 'address',
      title: 'Bybit: Hot Wallet 6',
      chain: 'base',
      href: `/flow/base/${EXCHANGE}`,
      label: { type: 'exchange', source: 'external', sourceName: 'Blockscout' },
      meta: { kind: 'address', view: 'flow', scannedChains: ['base'] },
    });
    // Nama label dugaan juga bisa dicari, tapi label utama tetap yang eksternal.
    expect((await search('?q=paus')).results[0].label.type).toBe('exchange');
  });

  it('address persis: per chain, plus hasil multichain bila dikenal di beberapa chain', async () => {
    const body = await search(`?q=${WALLET.toUpperCase().replace('0X', '0x')}`);
    expect(body.queryKind).toBe('evm_address');
    expect(body.results.map((item: ResultBody) => [item.kind, item.chain, item.href, item.matchedBy])).toEqual([
      ['address', 'ethereum', `/flow/ethereum/${WALLET}`, 'Address persis'],
      ['address', 'base', `/flow/base/${WALLET}`, 'Address persis'],
      ['address', null, `/multichain/${WALLET}`, 'Address persis di beberapa chain'],
    ]);
    expect(body.results[2]).toMatchObject({ chains: ['ethereum', 'base'], meta: { view: 'multichain', scannedChains: ['ethereum', 'base'] } });
    const token = await search(`?q=${TOKEN.toLowerCase()}`);
    expect(token.results[0]).toMatchObject({ kind: 'token', matchedBy: 'Address kontrak token persis' });
  });

  it('hash transaksi persis: dibuka di aliran dana pengirim, langsung ke buktinya', async () => {
    const body = await search(`?q=${TX}`);
    expect(body.queryKind).toBe('evm_tx');
    expect(body.results).toEqual([
      expect.objectContaining({
        kind: 'transaction',
        chain: 'ethereum',
        href: `/flow/ethereum/${FUNDER}#bukti-${TX}`,
        meta: { kind: 'transaction', timestamp: '2026-10-01T00:00:00.000Z', blockNumber: 700, movementCount: 1 },
      }),
    ]);
  });

  it('filter jenis, jaringan, label, dan sumber, dengan jumlah tiap pilihan', async () => {
    const all = await search(`?q=${WALLET}`);
    expect(all.facets.kinds).toEqual({ all: 3, token: 0, address: 3, transaction: 0 });
    expect(all.facets.chains).toEqual([
      { chain: 'ethereum', count: 2 },
      { chain: 'base', count: 2 },
    ]);
    const onBase = await search(`?q=${WALLET}&chains=base`);
    expect(onBase.results.map((item: ResultBody) => item.href)).toEqual([`/flow/base/${WALLET}`, `/multichain/${WALLET}`]);
    expect(onBase.total).toBe(2);
    const external = await search('?q=bybit&labelSource=external');
    expect(external.total).toBe(1);
    const noLabel = await search('?q=bybit&labels=none');
    expect(noLabel.total).toBe(0);
    expect(noLabel.facets.labels).toEqual([{ key: 'exchange', count: 1 }]);
    const tokensOnly = await search('?q=nebula&kind=address');
    expect(tokensOnly).toMatchObject({ total: 0, facets: { kinds: { all: 1, token: 1 } } });
  });

  it('kosong, terlalu pendek, atau tidak ditemukan dijelaskan; masukan salah ditolak', async () => {
    expect(await search('')).toMatchObject({ queryKind: 'empty', results: [], total: 0, caveats: [] });
    expect((await search('?q=n')).caveats[0]).toContain('minimal 2');
    const missing = await search(`?q=0x${'99'.repeat(20)}`);
    expect(missing.caveats[0]).toContain('bukan berarti tidak ada di blockchain');
    const server = app.getHttpServer();
    await request(server).get('/api/search?q=a&kind=nft').expect(400);
    await request(server).get('/api/search?q=a&labels=kucing').expect(400);
    await request(server).get('/api/search?q=a&labelSource=semua').expect(400);
    await request(server).get('/api/search?q=a&limit=101').expect(400);
    await request(server).get(`/api/search?q=${'x'.repeat(201)}`).expect(400);
  });
});
