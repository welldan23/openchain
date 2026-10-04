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
import { MovementClassificationService } from '../src/flows/movement-classification.service.js';
import type { AddressFlowCollection, KindCoverage } from '../src/flows/fund-flow.types.js';
import type { IndexedNativeTransfer, IndexedTokenTransfer } from '../src/providers/provider.types.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';

const WALLET = '0x7E5bF5e0E4897549C5d1B4D22BfE8Ad1A50B7DC8';
const EXCHANGE = '0x' + 'e1'.repeat(20);
const FRIEND = '0x' + 'f2'.repeat(20);
const TOKEN = '0x' + '70'.repeat(20);
const SCANNED_AT = new Date('2026-10-03T04:30:00Z');

let seq = 0;
const hash = () => `0x${(++seq).toString(16).padStart(64, '0')}`;
/** Blok N terjadi N jam setelah 1 Sep 2026. */
const at = (block: number) => new Date(Date.UTC(2026, 8, 1) + block * 3_600_000);

const native = (from: string, to: string, amountRaw: string, block: number, kind: 'transaction' | 'internal' = 'transaction'): IndexedNativeTransfer => ({
  txHash: hash(),
  kind,
  tracePath: kind === 'internal' ? '0' : '',
  from,
  to,
  amountRaw,
  blockNumber: block,
  timestamp: at(block),
});

const token = (from: string, to: string, amountRaw: string, block: number): IndexedTokenTransfer => ({
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

function collection(): AddressFlowCollection {
  return {
    chainId: 'robinhood',
    address: WALLET,
    fetchedAt: SCANNED_AT,
    runs: [],
    head: { blockNumber: 760, timestamp: at(760) },
    nativeTransfers: [
      native(EXCHANGE, WALLET, '5000000000000000000', 10),
      native(WALLET, FRIEND, '1000000000000000000', 700),
      native(FRIEND, WALLET, '7', 740, 'internal'),
      native(WALLET, WALLET, '1', 745),
    ],
    tokenTransfers: [token(FRIEND, WALLET, '3000000000000000000', 740), token(WALLET, EXCHANGE, '1', 750)],
    coverage: { native: covered, internal: covered, tokens: covered },
    scan: {
      blockFrom: 0,
      blockTo: 760,
      windowFrom: at(0),
      windowTo: at(760),
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

describe('Endpoint aliran: daftar transfer dan pilihan chain', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    await new FundFlowIngestionService(db as unknown as Database).persist(collection(), 'evm');
    const [exchange] = await db.select().from(schema.addresses).where(eq(schema.addresses.addressNormalized, EXCHANGE));
    await db.insert(schema.labels).values({
      addressId: exchange.id,
      labelType: 'exchange',
      name: 'Hot wallet exchange',
      source: 'external',
      sourceName: 'Blockscout',
      classification: 'external_label',
    });
    // Label masuk setelah ingest: klasifikasi jenis perpindahan dihitung ulang.
    await new MovementClassificationService(db as unknown as Database).reclassifyAddress('robinhood', exchange.id, new Date('2026-10-03T04:40:00Z'));
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

  const transfers = (query = '', address = WALLET) => `/api/flows/robinhood/${address}/transfers${query}`;

  describe('GET /api/flows/:chain/:address/transfers', () => {
    it('mengembalikan transfer terbaru dulu dengan arah, lawan transaksi, label, dan aset', async () => {
      const { body } = await request(app.getHttpServer()).get(transfers()).expect(200);
      expect(body).toMatchObject({ address: WALLET, direction: null, nextCursor: null, dataStatus: 'complete', window: { preset: 'all' } });
      expect(body.items.map((item: { direction: string; transferKind: string; blockNumber: number }) => [item.direction, item.transferKind, item.blockNumber])).toEqual([
        ['out', 'token', 750],
        ['self', 'native', 745],
        ['in', 'token', 740],
        ['in', 'internal', 740],
        ['out', 'native', 700],
        ['in', 'native', 10],
      ]);
      expect(body.items[0]).toMatchObject({
        counterparty: { address: EXCHANGE, labels: [{ type: 'exchange', name: 'Hot wallet exchange', source: 'external' }] },
        asset: { type: 'token', symbol: 'NBLA', decimals: 18 },
        amountRaw: '1',
        amountUsd: null,
        classification: 'verified_fact',
        movement: {
          type: 'exchange_deposit',
          classification: 'external_label',
          basis: 'Penerima berlabel exchange: Hot wallet exchange (Blockscout).',
          confidence: null,
        },
      });
      // Penarikan dari exchange dan transfer biasa.
      expect(body.items[5].movement).toMatchObject({ type: 'exchange_withdrawal', classification: 'external_label' });
      expect(body.items[4].movement).toMatchObject({ type: 'transfer', classification: 'verified_fact' });
      expect(body.items[5]).toMatchObject({ asset: { type: 'native', symbol: 'ETH' }, amount: '5', timestamp: at(10).toISOString() });
    });

    it('menyaring arah dan rentang preset dari akhir cakupan', async () => {
      const incoming = await request(app.getHttpServer()).get(transfers('?direction=in')).expect(200);
      expect(incoming.body.items.map((item: { direction: string }) => item.direction)).toEqual(['in', 'in', 'in']);
      // 7 hari = 168 jam sebelum blok 760: blok 592 ke atas.
      const week = await request(app.getHttpServer()).get(transfers('?range=7d&direction=out')).expect(200);
      expect(week.body).toMatchObject({ window: { preset: '7d' }, direction: 'out' });
      expect(week.body.items.map((item: { blockNumber: number }) => item.blockNumber)).toEqual([750, 700]);
    });

    it('membagi per halaman dengan cursor tanpa melewatkan atau menggandakan transfer', async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query: string = `?limit=4${cursor ? `&cursor=${cursor}` : ''}`;
        const response = await request(app.getHttpServer()).get(transfers(query)).expect(200);
        seen.push(...response.body.items.map((item: { id: string }) => item.id));
        cursor = response.body.nextCursor;
        pages += 1;
      } while (cursor && pages < 10);
      expect(pages).toBe(2);
      expect(seen).toHaveLength(6);
      expect(new Set(seen).size).toBe(6);
    });

    it('menolak parameter yang salah', async () => {
      const server = app.getHttpServer();
      await request(server).get(transfers('?direction=keluar')).expect(400);
      await request(server).get(transfers('?limit=0')).expect(400);
      await request(server).get(transfers('?limit=500')).expect(400);
      expect((await request(server).get(transfers('?cursor=bukan-cursor')).expect(400)).body.message).toContain('cursor');
      await request(server).get(transfers('?range=7d&to=2026-10-01T00:00:00Z')).expect(400);
      await request(server).get(transfers('', '0x' + '99'.repeat(20))).expect(404);
    });
  });

  describe('GET /api/flows/:address/chains', () => {
    const chains = (query = '', address = WALLET) => `/api/flows/${address}/chains${query}`;

    it('menampilkan semua chain EVM; yang belum dipindai punya jumlah transfer null, bukan nol', async () => {
      const { body } = await request(app.getHttpServer()).get(chains()).expect(200);
      expect(body.address).toBe(WALLET);
      expect(body.chains.map((entry: { chain: { id: string } }) => entry.chain.id)).toEqual([
        'robinhood',
        'ethereum',
        'base',
        'bsc',
        'arbitrum',
        'optimism',
        'polygon',
        'hyperevm',
      ]);
      expect(body.chains[0]).toMatchObject({ known: true, transferCount: 6, scan: { blockTo: 760 }, dataStatus: 'complete' });
      expect(body.chains[1]).toMatchObject({ known: false, scan: null, transferCount: null, dataStatus: 'unavailable' });
    });

    it('menyaring chain dengan ?chains= dan menolak chain yang tidak dikenal atau formatnya tidak cocok', async () => {
      const server = app.getHttpServer();
      const { body } = await request(server).get(chains('?chains=base,robinhood')).expect(200);
      expect(body.chains.map((entry: { chain: { id: string } }) => entry.chain.id)).toEqual(['robinhood', 'base']);
      expect((await request(server).get(chains('?chains=mars')).expect(400)).body.message).toContain('mars');
      expect((await request(server).get(chains('?chains=solana')).expect(400)).body.message).toContain('solana');
      expect((await request(server).get(chains('?chains=tron')).expect(400)).body.message).toContain('fase 4');
    });

    it('address Solana hanya dicocokkan dengan chain Solana', async () => {
      const solana = 'gfiT3SHJHGgq2bhMnP3HqRaV8dhMDvyqtvCvLok3sXPg';
      const { body } = await request(app.getHttpServer()).get(chains('', solana)).expect(200);
      expect(body.chains.map((entry: { chain: { id: string } }) => entry.chain.id)).toEqual(['solana']);
      await request(app.getHttpServer()).get(chains('', 'bukan-address')).expect(400);
    });
  });
});
