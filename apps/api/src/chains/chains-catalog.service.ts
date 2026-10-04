import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import type { ChainCapability, ChainFamily, ChainSupportStatus } from '../database/schema/enums.js';
import { chainCapabilities, chains, chainSmokeChecks } from '../database/schema/index.js';
import { compareChains, toCatalogItem, toCheckSummary, toCheckViews } from './chains-catalog.mapper.js';
import type { ChainCatalogResponse, ChainDetailResponse } from './chains-catalog.types.js';

export interface ChainCatalogQuery {
  family?: ChainFamily;
  status?: ChainSupportStatus;
  /** Hanya chain yang kemampuan ini minimal `experimental`. */
  capability?: ChainCapability;
}

const HISTORY_LIMIT = 10;

const CAVEATS = [
  'Status hanya naik lewat smoke test tersimpan. Chain berstatus planned atau experimental belum boleh disebut didukung penuh.',
  'Kemampuan yang belum pernah diuji selalu planned, walau adapter-nya sudah ada.',
];

/** Daftar jaringan dan bukti status dukungannya. Hanya membaca database. */
@Injectable()
export class ChainsCatalogService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(query: ChainCatalogQuery = {}): Promise<ChainCatalogResponse> {
    const rows = (await this.db.select().from(chains)).sort(compareChains);
    const [capabilities, checks] = await Promise.all([this.db.select().from(chainCapabilities), this.checksFor(rows)]);
    const items = rows
      .map((row) =>
        toCatalogItem(
          row,
          capabilities.filter((item) => item.chainId === row.id),
          checks,
        ),
      )
      .filter((item) => !query.family || item.family === query.family)
      .filter((item) => !query.status || item.supportStatus === query.status)
      .filter((item) => !query.capability || item.capabilities.some((cap) => cap.capability === query.capability && cap.status !== 'planned'));
    return {
      chains: items,
      summary: {
        total: items.length,
        validated: items.filter((item) => item.supportStatus === 'validated').length,
        experimental: items.filter((item) => item.supportStatus === 'experimental').length,
        planned: items.filter((item) => item.supportStatus === 'planned').length,
      },
      caveats: CAVEATS,
    };
  }

  async detail(chainId: string): Promise<ChainDetailResponse> {
    const [row] = await this.db.select().from(chains).where(eq(chains.id, chainId)).limit(1);
    if (!row) throw new NotFoundException(`Chain "${chainId}" tidak dikenal.`);
    const [capabilities, history] = await Promise.all([
      this.db.select().from(chainCapabilities).where(eq(chainCapabilities.chainId, row.id)),
      this.db
        .select()
        .from(chainSmokeChecks)
        .where(eq(chainSmokeChecks.chainId, row.id))
        .orderBy(desc(chainSmokeChecks.testedAt), desc(chainSmokeChecks.id))
        .limit(HISTORY_LIMIT),
    ]);
    const checks = await this.checksFor([row], capabilities.flatMap((item) => (item.checkId === null ? [] : [item.checkId])));
    for (const check of history) checks.set(check.id, check);
    const current = row.supportCheckId === null ? undefined : checks.get(row.supportCheckId);
    return {
      chain: toCatalogItem(row, capabilities, checks),
      checks: current ? toCheckViews(current.checks) : [],
      history: history.map(toCheckSummary),
      caveats: current ? CAVEATS : [...CAVEATS, 'Chain ini belum pernah diuji lewat smoke test.'],
    };
  }

  private async checksFor(rows: ReadonlyArray<typeof chains.$inferSelect>, extraIds: number[] = []) {
    const capabilityChecks = await this.db
      .selectDistinct({ checkId: chainCapabilities.checkId })
      .from(chainCapabilities)
      .where(inArray(chainCapabilities.chainId, rows.map((row) => row.id)));
    const ids = [
      ...new Set([
        ...rows.flatMap((row) => (row.supportCheckId === null ? [] : [row.supportCheckId])),
        ...capabilityChecks.flatMap((row) => (row.checkId === null ? [] : [row.checkId])),
        ...extraIds,
      ]),
    ];
    const found = ids.length === 0 ? [] : await this.db.select().from(chainSmokeChecks).where(inArray(chainSmokeChecks.id, ids)).orderBy(asc(chainSmokeChecks.id));
    return new Map(found.map((check) => [check.id, check]));
  }
}

