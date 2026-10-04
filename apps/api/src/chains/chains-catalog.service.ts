import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../database/database.module.js';
import type { ChainCapability, ChainFamily, ChainSupportStatus } from '../database/schema/enums.js';
import { chainCapabilities, chains, chainSmokeChecks } from '../database/schema/index.js';
import { compareChains, toCatalogItem, toCheckSummary, toCheckViews } from './chains-catalog.mapper.js';
import { chainStatus, toProviderAvailability, type ProviderRunStats } from './chain-availability.js';
import type { ChainAvailabilityItem, ChainAvailabilityResponse, ChainCatalogResponse, ChainDetailResponse } from './chains-catalog.types.js';

export interface ChainCatalogQuery {
  family?: ChainFamily;
  status?: ChainSupportStatus;
  /** Hanya chain yang kemampuan ini minimal `experimental`. */
  capability?: ChainCapability;
}

const HISTORY_LIMIT = 10;
export const DEFAULT_AVAILABILITY_HOURS = 24;
export const MAX_AVAILABILITY_HOURS = 168;

const CAVEATS = [
  'Status hanya naik lewat smoke test tersimpan. Chain berstatus planned atau experimental belum boleh disebut didukung penuh.',
  'Kemampuan yang belum pernah diuji selalu planned, walau adapter-nya sudah ada.',
];

/** Daftar jaringan dan bukti status dukungannya. Hanya membaca database. */
@Injectable()
export class ChainsCatalogService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Kesehatan sumber data tiap chain dari `provider_runs` dalam `hours` jam terakhir. */
  async availability(hours = DEFAULT_AVAILABILITY_HOURS, chainId?: string): Promise<ChainAvailabilityResponse> {
    const to = this.clock.now();
    const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
    const rows = (await this.db.select().from(chains)).filter((row) => !chainId || row.id === chainId).sort(compareChains);
    const stats = await this.runStats(from, chainId);
    const items: ChainAvailabilityItem[] = rows.map((row) => {
      const providers = (stats.get(row.id) ?? []).map(toProviderAvailability).sort((a, b) => a.kind.localeCompare(b.kind) || a.provider.localeCompare(b.provider));
      return { chain: { id: row.id, name: row.name, supportStatus: row.supportStatus }, status: chainStatus(providers), providers };
    });
    return {
      window: { from: from.toISOString(), to: to.toISOString(), hours },
      chains: items,
      caveats: [
        'Dihitung dari pengambilan data yang benar-benar dijalankan (ingest, pemindaian aliran dana, smoke test). Chain tanpa pengambilan dalam rentang ini berstatus unknown, bukan berarti mati.',
        'Alasan kegagalan disimpan tanpa URL atau API key.',
      ],
    };
  }

  private async runStats(since: Date, chainId?: string): Promise<Map<string, ProviderRunStats[]>> {
    const result = (await this.db.execute(sql`
      select chain_id, provider, kind::text as kind,
        count(*)::int as runs,
        count(*) filter (where status = 'unavailable')::int as failures,
        (array_agg(status::text order by started_at desc, id desc))[1] as last_status,
        max(coalesce(fetched_at, started_at)) filter (where status <> 'unavailable') as last_success,
        max(started_at) filter (where status = 'unavailable') as last_failure,
        (array_agg(error_reason order by started_at desc, id desc) filter (where status = 'unavailable'))[1] as last_failure_reason
      from provider_runs
      where chain_id is not null and started_at >= ${since} ${chainId ? sql`and chain_id = ${chainId}` : sql``}
      group by chain_id, provider, kind`)) as unknown as { rows: Array<Record<string, unknown>> };
    const grouped = new Map<string, ProviderRunStats[]>();
    const date = (value: unknown) => (value === null || value === undefined ? null : new Date(value as string | Date));
    for (const row of result.rows) {
      const chain = String(row.chain_id);
      grouped.set(chain, [
        ...(grouped.get(chain) ?? []),
        {
          provider: String(row.provider),
          kind: String(row.kind),
          runs: Number(row.runs),
          failures: Number(row.failures),
          lastStatusFailed: row.last_status === 'unavailable',
          lastSuccessAt: date(row.last_success),
          lastFailureAt: date(row.last_failure),
          lastFailureReason: row.last_failure_reason === null || row.last_failure_reason === undefined ? null : String(row.last_failure_reason),
        },
      ]);
    }
    return grouped;
  }

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
    const availability = await this.availability(DEFAULT_AVAILABILITY_HOURS, row.id);
    return {
      chain: toCatalogItem(row, capabilities, checks),
      availability: availability.chains[0],
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

