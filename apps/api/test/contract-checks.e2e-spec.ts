import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CLOCK } from '../src/common/clock.js';
import { DATABASE } from '../src/database/database.module.js';
import {
  createTestDatabase,
  seedContractChecks,
  seedToken,
  testTxHash,
  type TestDatabase,
} from './support/database.js';

const ROBINHOOD_TOKEN = '0x' + 'A7'.repeat(20);
const ETHEREUM_TOKEN = '0x' + 'B8'.repeat(20);
const NO_SNAPSHOT_TOKEN = '0x' + 'C9'.repeat(20);

describe('GET /api/tokens/:chain/:address/contract-checks', () => {
  let client: PGlite;
  let db: TestDatabase;
  let app: INestApplication<App>;
  let latestSnapshotId: number;

  beforeAll(async () => {
    ({ client, db } = await createTestDatabase());
    const robinhood = await seedToken(db, { address: ROBINHOOD_TOKEN });
    latestSnapshotId = robinhood.snapshots[1].id;
    await seedContractChecks(db, 'robinhood', latestSnapshotId);
    const ethereum = await seedToken(db, { chainId: 'ethereum', address: ETHEREUM_TOKEN });
    await seedContractChecks(db, 'ethereum', ethereum.snapshots[1].id);
    await seedToken(db, { address: NO_SNAPSHOT_TOKEN, withSnapshot: false });

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

  const url = (chain: string, address: string) => `/api/tokens/${chain}/${address}/contract-checks`;

  it('mengurutkan pemeriksaan dari yang paling bermasalah dan merekap jumlahnya', async () => {
    const { body } = await request(app.getHttpServer()).get(url('robinhood', ROBINHOOD_TOKEN)).expect(200);
    expect(body.token).toEqual({ address: ROBINHOOD_TOKEN, standard: 'erc20', standardLabel: 'ERC-20' });
    expect(body.snapshot).toMatchObject({ blockNumber: 23512880, dataStatus: 'partial' });
    expect(body.summary).toEqual([
      { status: 'fail', count: 1 },
      { status: 'warn', count: 1 },
      { status: 'unknown', count: 1 },
      { status: 'pass', count: 2 },
    ]);
    expect(body.checks.map((check: { code: string }) => check.code)).toEqual([
      'tax',
      'ownership',
      'honeypot',
      'verified',
      'mint',
    ]);
  });

  it('menyertakan bukti lengkap di tiap pemeriksaan', async () => {
    const { body } = await request(app.getHttpServer()).get(url('robinhood', ROBINHOOD_TOKEN)).expect(200);
    const tax = body.checks[0];
    expect(tax).toMatchObject({
      label: 'Pajak transaksi',
      status: 'fail',
      value: 'Beli 2% · Jual 5%, bisa diubah owner',
      classification: 'verified_fact',
    });
    expect(tax.evidence).toEqual([
      expect.objectContaining({
        classification: 'verified_fact',
        explanation: 'Owner menaikkan pajak jual dari 2% menjadi 5%.',
        txHash: testTxHash(`tax-${latestSnapshotId}`),
        blockNumber: 23400000,
        blockTimestamp: '2026-09-28T10:05:00.000Z',
        method: 'setSellTax(uint256)',
        explorerUrl: `https://robinhoodchain.blockscout.com/tx/${testTxHash(`tax-${latestSnapshotId}`)}`,
      }),
    ]);
    const honeypot = body.checks.find((check: { code: string }) => check.code === 'honeypot');
    expect(honeypot).toMatchObject({ status: 'unknown', classification: null, evidence: [] });
  });

  it('membentuk tautan explorer untuk chain yang punya explorer', async () => {
    const { body } = await request(app.getHttpServer()).get(url('ethereum', ETHEREUM_TOKEN)).expect(200);
    const evidence = body.checks[0].evidence[0];
    expect(evidence.explorerUrl).toBe(`https://etherscan.io/tx/${evidence.txHash}`);
  });

  it('snapshot lama tidak punya hasil cek dan melaporkan pemeriksaan kosong', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`${url('robinhood', ROBINHOOD_TOKEN)}?block=23512000`)
      .expect(200);
    expect(body).toMatchObject({ snapshot: { blockNumber: 23512000 }, summary: [], checks: [] });
  });

  it('melaporkan unavailable untuk token tanpa snapshot', async () => {
    const { body } = await request(app.getHttpServer()).get(url('robinhood', NO_SNAPSHOT_TOKEN)).expect(200);
    expect(body).toMatchObject({ snapshot: null, dataStatus: 'unavailable', summary: [], checks: [] });
  });

  it('memakai validasi yang sama dengan endpoint lain', async () => {
    await request(app.getHttpServer()).get(url('dogechain', ROBINHOOD_TOKEN)).expect(404);
    await request(app.getHttpServer()).get(url('robinhood', '0x1234')).expect(400);
    await request(app.getHttpServer()).get(url('robinhood', '0x' + '0'.repeat(40))).expect(404);
  });
});
