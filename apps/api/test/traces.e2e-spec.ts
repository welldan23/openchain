import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import * as schema from '../src/database/schema/index.js';
import { FundFlowIngestionService } from '../src/flows/fund-flow-ingestion.service.js';
import type { AddressFlowCollection, KindCoverage } from '../src/flows/fund-flow.types.js';
import type { IndexedNativeTransfer, IndexedTokenTransfer } from '../src/providers/provider.types.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

const EXCHANGE = '0x' + 'e1'.repeat(20);
const FUNDER = '0x7E5bF5e0E4897549C5d1B4D22BfE8Ad1A50B7DC8';
const BUNDLER = '0x' + 'b1'.repeat(20);
const TARGET = '0x' + 'a7'.repeat(20);
const VIA_EXCHANGE = '0x' + 'c3'.repeat(20);
const TOO_EARLY = '0x' + 'd4'.repeat(20);
const TOKEN = '0x' + '70'.repeat(20);
const SCANNED_AT = new Date('2026-10-03T04:30:00Z');

let seq = 0;
const hash = () => `0x${(++seq).toString(16).padStart(64, '0')}`;
const at = (block: number) => new Date(Date.UTC(2026, 8, 1) + block * 60_000);

const native = (from: string, to: string, amountRaw: string, block: number): IndexedNativeTransfer => ({
  txHash: hash(),
  kind: 'transaction',
  tracePath: '',
  from,
  to,
  amountRaw,
  blockNumber: block,
  timestamp: at(block),
});

const tokenTransfer = (from: string, to: string, amountRaw: string, block: number): IndexedTokenTransfer => ({
  txHash: hash(),
  logIndex: 0,
  token: { address: TOKEN, symbol: 'NBLA', name: 'Nebula Finance', decimals: 18 },
  from,
  to,
  amountRaw,
  blockNumber: block,
  timestamp: at(block),
});

const covered: KindCoverage = { failure: null, exhausted: true, pages: 1, oldest: null, skipped: null };

function scanOf(address: string, nativeTransfers: IndexedNativeTransfer[], tokenTransfers: IndexedTokenTransfer[] = []): AddressFlowCollection {
  return {
    chainId: 'robinhood',
    address,
    fetchedAt: SCANNED_AT,
    runs: [],
    head: { blockNumber: 1_000, timestamp: SCANNED_AT },
    nativeTransfers,
    tokenTransfers,
    coverage: { native: covered, internal: covered, tokens: covered },
    scan: {
      blockFrom: 0,
      blockTo: 1_000,
      windowFrom: at(0),
      windowTo: SCANNED_AT,
      nativeScanned: true,
      tokensScanned: true,
      internalScanned: true,
      status: 'complete',
      statusReason: null,
      missingFields: [],
    },
    failure: null,
  };
}

describe('GET /api/traces/:chain/:from/:to', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    const ingestion = new FundFlowIngestionService(db as unknown as Database);
    // Pendana: modal dari exchange, lalu ke bundler, setor ke exchange, dan ke wallet yang terlalu awal.
    await ingestion.persist(
      scanOf(FUNDER, [
        native(EXCHANGE, FUNDER, '10000000000000000000', 100),
        native(FUNDER, BUNDLER, '2000000000000000000', 200),
        native(FUNDER, EXCHANGE, '1000000000000000000', 150),
      ]),
      'evm',
    );
    // Target dipindai: bundler mengirim token ke target. Bundler sendiri belum pernah dipindai.
    await ingestion.persist(scanOf(TARGET, [], [tokenTransfer(BUNDLER, TARGET, '5000000000000000000000', 300)]), 'evm');
    // Exchange dipindai: mengirim ke wallet lain setelah setoran pendana.
    await ingestion.persist(scanOf(VIA_EXCHANGE, [native(EXCHANGE, VIA_EXCHANGE, '1000000000000000000', 160)]), 'evm');
    // Transfer bundler ke wallet ini terjadi SEBELUM bundler menerima dana pendana.
    await ingestion.persist(scanOf(TOO_EARLY, [native(BUNDLER, TOO_EARLY, '1', 150)]), 'evm');

    const [exchange] = await db.select().from(schema.addresses).where(eq(schema.addresses.addressNormalized, EXCHANGE));
    await db.insert(schema.labels).values({
      addressId: exchange.id,
      labelType: 'exchange',
      name: 'Hot wallet exchange',
      source: 'external',
      sourceName: 'Blockscout',
      classification: 'external_label',
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(db)
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date('2026-10-03T05:00:00Z') })
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  const url = (from: string, to: string, query = '', chain = 'robinhood') => `/api/traces/${chain}/${from}/${to}${query}`;

  it('menemukan jalur berurutan lewat native lalu token, dengan langkah sebagai fakta dan jalur sebagai dugaan', async () => {
    const { body } = await request(app.getHttpServer()).get(url(FUNDER.toLowerCase(), TARGET)).expect(200);
    expect(body).toMatchObject({
      found: true,
      maxHops: 4,
      throughHubs: false,
      pathClassification: 'heuristic',
      from: { address: FUNDER, scanned: true },
      to: { address: TARGET, scanned: true },
      dataStatus: 'complete',
    });
    expect(body.hops).toHaveLength(2);
    expect(body.hops[0]).toMatchObject({
      index: 0,
      from: { address: FUNDER },
      to: { address: BUNDLER, scanned: false },
      transferKind: 'native',
      asset: { type: 'native', symbol: 'ETH', decimals: 18 },
      amount: '2',
      blockNumber: 200,
      classification: 'verified_fact',
    });
    expect(body.hops[1]).toMatchObject({
      transferKind: 'token',
      asset: { type: 'token', address: TOKEN, symbol: 'NBLA' },
      amountRaw: '5000000000000000000000',
      amount: '5000',
      blockNumber: 300,
    });
    expect(body.caveats[0]).toContain('dugaan');
  });

  it('tidak melewati exchange secara default, dan menjelaskannya', async () => {
    const { body } = await request(app.getHttpServer()).get(url(FUNDER, VIA_EXCHANGE)).expect(200);
    expect(body).toMatchObject({ found: false, hops: [], search: { hubsSkipped: 1 } });
    expect(body.caveats.join(' ')).toContain('throughHubs=true');
    expect(body.caveats.join(' ')).toContain('bukan bukti tidak ada hubungan');
  });

  it('dengan throughHubs, jalur lewat exchange ditemukan tapi diberi peringatan', async () => {
    const { body } = await request(app.getHttpServer()).get(url(FUNDER, VIA_EXCHANGE, '?throughHubs=true')).expect(200);
    expect(body.found).toBe(true);
    expect(body.hops.map((hop: { to: { address: string } }) => hop.to.address)).toEqual([EXCHANGE, VIA_EXCHANGE]);
    expect(body.hops[0].to.labels[0]).toMatchObject({ type: 'exchange', source: 'external', sourceName: 'Blockscout' });
    expect(body.caveats.join(' ')).toContain('Hot wallet exchange');
  });

  it('menolak jalur yang melanggar urutan waktu', async () => {
    const { body } = await request(app.getHttpServer()).get(url(FUNDER, TOO_EARLY)).expect(200);
    expect(body.found).toBe(false);
    // Bundler belum pernah dipindai: tidak ditemukan bukan berarti pasti tidak ada.
    expect(body.search.unscannedAddresses).toBeGreaterThan(0);
    expect(body.dataStatus).toBe('partial');
  });

  it('menghormati batas langkah', async () => {
    const { body } = await request(app.getHttpServer()).get(url(FUNDER, TARGET, '?maxHops=1')).expect(200);
    expect(body).toMatchObject({ found: false, maxHops: 1 });
  });

  it('tujuan yang belum muncul di data mana pun: tidak ditemukan, dengan alasan', async () => {
    const unknown = '0x' + '99'.repeat(20);
    const { body } = await request(app.getHttpServer()).get(url(FUNDER, unknown)).expect(200);
    expect(body).toMatchObject({ found: false, to: { address: unknown, scanned: false, labels: [] } });
    expect(body.caveats[0]).toContain('belum muncul');
  });

  it('menolak masukan yang salah', async () => {
    const server = app.getHttpServer();
    await request(server).get(url(FUNDER, FUNDER.toLowerCase())).expect(400);
    await request(server).get(url('0x12', TARGET)).expect(400);
    await request(server).get(url(FUNDER, TARGET, '?maxHops=9')).expect(400);
    await request(server).get(url(FUNDER, TARGET, '?throughHubs=ya')).expect(400);
    await request(server).get(url(FUNDER, TARGET, '', 'mars')).expect(404);
    expect((await request(server).get(url('0x' + '98'.repeat(20), TARGET)).expect(404)).body.message).toContain('belum pernah dipindai');
  });
});
