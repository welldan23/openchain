import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import type { DataStatus } from '../database/schema/enums.js';
import type { SubjectSource } from './case-snapshot.js';

type Raw = Record<string, unknown>;

const inList = (values: readonly string[]) =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );

/** Query baca untuk kasus: sumber snapshot subjek dan hitungan daftar kasus. */
@Injectable()
export class CasesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Snapshot token terbaru beserta provider yang membentuknya. */
  async tokenSource(chainId: string, addressNormalized: string): Promise<SubjectSource | null> {
    const [row] = await this.rows(sql`
      select s.block_number, s.fetched_at, s.data_status,
        coalesce((select array_agg(distinct r.provider order by r.provider) from token_snapshot_sources ss
          join provider_runs r on r.id = ss.provider_run_id where ss.snapshot_id = s.id), '{}') as providers
      from token_snapshots s
      join tokens t on t.id = s.token_id
      join addresses a on a.id = t.address_id
      where a.chain_id = ${chainId} and a.address_normalized = ${addressNormalized}
      order by s.block_number desc, s.id desc
      limit 1`);
    return row ? toSource(chainId, row) : null;
  }

  /** Pemindaian aliran dana terbaru yang terbaca, satu per chain. */
  async scanSources(chainIds: readonly string[], addressNormalized: string): Promise<SubjectSource[]> {
    if (chainIds.length === 0) return [];
    const rows = await this.rows(sql`
      select distinct on (f.chain_id) f.chain_id, f.block_to as block_number, f.scanned_at as fetched_at, f.status as data_status,
        case when r.provider is null then '{}'::text[] else array[r.provider] end as providers
      from address_flow_scans f
      join addresses a on a.id = f.address_id
      left join provider_runs r on r.id = f.provider_run_id
      where a.address_normalized = ${addressNormalized} and f.chain_id in (${inList(chainIds)}) and f.status <> 'unavailable'
      order by f.chain_id, f.scanned_at desc, f.id desc`);
    return rows.map((row) => toSource(String(row.chain_id), row));
  }

  /** Address tersimpan dengan bentuk ternormalisasi ini di chain-chain tersebut. */
  async addressIds(chainIds: readonly string[], addressNormalized: string): Promise<Array<{ chainId: string; id: number }>> {
    if (chainIds.length === 0) return [];
    const rows = await this.rows(sql`
      select a.id, a.chain_id from addresses a
      where a.address_normalized = ${addressNormalized} and a.chain_id in (${inList(chainIds)})
      order by a.id`);
    return rows.map((row) => ({ chainId: String(row.chain_id), id: Number(row.id) }));
  }

  /** Hitungan isi tiap kasus untuk daftar kasus. */
  async counts() {
    const rows = await this.rows(sql`
      select c.id,
        (select count(*)::int from case_subjects s where s.case_id = c.id) as subject_count,
        (select count(*)::int from case_findings f where f.case_id = c.id) as finding_count,
        (select count(distinct (e.chain_id, e.tx_hash))::int from case_finding_evidence e join case_findings f on f.id = e.finding_id where f.case_id = c.id) as evidence_count,
        (select count(*)::int from case_notes n where n.case_id = c.id) as note_count,
        array(
          select distinct x.chain_id from (
            select s.chain_id from case_subjects s where s.case_id = c.id and s.chain_id is not null
            union select e.chain_id from case_finding_evidence e join case_findings f on f.id = e.finding_id where f.case_id = c.id
          ) x
        ) as chains
      from cases c`);
    return new Map(
      rows.map((row) => [
        Number(row.id),
        {
          subjectCount: Number(row.subject_count),
          findingCount: Number(row.finding_count),
          evidenceCount: Number(row.evidence_count),
          noteCount: Number(row.note_count),
          chains: (row.chains as string[] | null) ?? [],
        },
      ]),
    );
  }

  private async rows(query: SQL): Promise<Raw[]> {
    const result = (await this.db.execute(query)) as unknown as { rows: Raw[] };
    return result.rows;
  }
}

function toSource(chainId: string, row: Raw): SubjectSource {
  return {
    chainId,
    blockNumber: Number(row.block_number),
    fetchedAt: new Date(row.fetched_at as string | Date),
    status: row.data_status as DataStatus,
    providers: (row.providers as string[] | null) ?? [],
  };
}
