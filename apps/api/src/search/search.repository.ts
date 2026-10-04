import { Inject, Injectable } from '@nestjs/common';
import { and, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import type { EntityLabelType, LabelSource } from '../database/schema/enums.js';
import { addressFlowScans } from '../database/schema/index.js';
import type { PrimaryLabelCount } from './label-options.js';

type Raw = Record<string, unknown>;

/** Label utama: eksternal dulu, lalu heuristic, lalu user; keyakinan tertinggi dulu. */
const PRIMARY_LABEL = (addressColumn: SQL) => sql`
  left join lateral (
    select l.label_type, l.name, l.source, l.source_name from labels l
    where l.address_id = ${addressColumn}
    order by case l.source when 'external' then 0 when 'heuristic' then 1 else 2 end, l.confidence desc nulls last, l.id
    limit 1
  ) pl on true`;

export interface IndexRow {
  kind: 'token' | 'address';
  chainId: string;
  addressId: number;
  tokenId: number | null;
  title: string;
  subtitle: string | null;
  address: string;
  label: { type: string; name: string | null; source: 'external' | 'heuristic' | 'user'; sourceName: string } | null;
  rank: number;
}

/** Query baca pencarian, dan pembangunan ulang indeks `search_entities` dari tabel sumber. */
@Injectable()
export class SearchRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Bangun ulang indeks: satu baris per token dan per address berlabel (yang
   * bukan kontrak token). Baris yang sumbernya sudah hilang dihapus.
   */
  async refreshIndex(now: Date): Promise<number> {
    return this.db.transaction(async (tx) => {
      const run = (query: SQL) => tx.execute(query);
      await run(sql`
        insert into search_entities (kind, chain_id, address_id, token_id, title, subtitle, label_type, label_name, label_source, label_source_name, search_text, refreshed_at)
        select 'token', t.chain_id, t.address_id, t.id,
          case when t.name is not null and t.symbol is not null then t.name || ' (' || t.symbol || ')' else coalesce(t.name, t.symbol, a.address) end,
          t.symbol, pl.label_type, pl.name, pl.source, pl.source_name,
          lower(concat_ws(' ', t.name, t.symbol, a.address_normalized)), ${now}
        from tokens t
        join addresses a on a.id = t.address_id
        ${PRIMARY_LABEL(sql`t.address_id`)}
        on conflict (kind, chain_id, address_id) do update set
          token_id = excluded.token_id, title = excluded.title, subtitle = excluded.subtitle,
          label_type = excluded.label_type, label_name = excluded.label_name, label_source = excluded.label_source,
          label_source_name = excluded.label_source_name, search_text = excluded.search_text, refreshed_at = excluded.refreshed_at`);
      await run(sql`
        insert into search_entities (kind, chain_id, address_id, token_id, title, subtitle, label_type, label_name, label_source, label_source_name, search_text, refreshed_at)
        select 'address', a.chain_id, a.id, null, coalesce(pl.name, pl.label_type::text), a.address,
          pl.label_type, pl.name, pl.source, pl.source_name,
          lower(concat_ws(' ',
            (select string_agg(coalesce(l.name, '') || ' ' || l.label_type::text, ' ') from labels l where l.address_id = a.id),
            a.address_normalized)), ${now}
        from addresses a
        ${PRIMARY_LABEL(sql`a.id`)}
        where pl.label_type is not null and not exists (select 1 from tokens t where t.address_id = a.id)
        on conflict (kind, chain_id, address_id) do update set
          title = excluded.title, subtitle = excluded.subtitle,
          label_type = excluded.label_type, label_name = excluded.label_name, label_source = excluded.label_source,
          label_source_name = excluded.label_source_name, search_text = excluded.search_text, refreshed_at = excluded.refreshed_at`);
      await run(sql`delete from search_entities where refreshed_at < ${now}`);
      const result = (await run(sql`select count(*)::int as total from search_entities`)) as unknown as { rows: Raw[] };
      return Number(result.rows[0]?.total ?? 0);
    });
  }

  /** Cocok teks bebas, paling relevan dulu. */
  async textSearch(tsQuery: string, limit: number): Promise<IndexRow[]> {
    const rows = await this.rows(sql`
      select s.kind, s.chain_id, s.address_id, s.token_id, s.title, s.subtitle, a.address,
        s.label_type, s.label_name, s.label_source, s.label_source_name,
        ts_rank(s.search_vector, to_tsquery('simple', ${tsQuery})) as rank
      from search_entities s
      join addresses a on a.id = s.address_id
      where s.search_vector @@ to_tsquery('simple', ${tsQuery})
      order by rank desc, s.kind, s.title, s.id
      limit ${limit}`);
    return rows.map(toIndexRow);
  }

  /** Address yang sama di semua chain keluarga ini, beserta token (bila address itu kontrak token). */
  async exactAddress(addressNormalized: string, chainIds: string[]) {
    if (chainIds.length === 0) return [];
    const rows = await this.rows(sql`
      select a.id as address_id, a.chain_id, a.address, t.id as token_id, t.name, t.symbol
      from addresses a
      left join tokens t on t.address_id = a.id
      where a.address_normalized = ${addressNormalized} and a.chain_id in (${sql.join(
        chainIds.map((id) => sql`${id}`),
        sql`, `,
      )})
      order by a.chain_id`);
    return rows.map((row) => ({
      addressId: Number(row.address_id),
      chainId: String(row.chain_id),
      address: String(row.address),
      tokenId: row.token_id === null ? null : Number(row.token_id),
      name: row.name === null ? null : String(row.name),
      symbol: row.symbol === null ? null : String(row.symbol),
    }));
  }

  /** Chain tempat transaksi ini tercatat, beserta pengirim perpindahan pertamanya. */
  async transactionsByHash(txHash: string, chainIds: string[]) {
    if (chainIds.length === 0) return [];
    const chainList = sql.join(
      chainIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const rows = await this.rows(sql`
      with moves as (
        select n.chain_id, n.block_number, n.block_timestamp, n.from_address_id, 0 as rank, n.id
        from native_transfers n where n.tx_hash = ${txHash} and n.chain_id in (${chainList})
        union all
        select t.chain_id, t.block_number, t.block_timestamp, t.from_address_id, 1, t.id
        from token_transfers t where t.tx_hash = ${txHash} and t.chain_id in (${chainList})
      ),
      ranked as (select moves.*, row_number() over (partition by chain_id order by rank, id) as rn, count(*) over (partition by chain_id) as total from moves)
      select r.chain_id, r.block_number, r.block_timestamp, r.total, a.address as sender
      from ranked r join addresses a on a.id = r.from_address_id
      where r.rn = 1
      order by r.chain_id`);
    return rows.map((row) => ({
      chainId: String(row.chain_id),
      blockNumber: Number(row.block_number),
      timestamp: new Date(row.block_timestamp as string | Date),
      movementCount: Number(row.total),
      sender: String(row.sender),
    }));
  }

  /** Ringkasan snapshot terbaru tiap token. */
  async tokenSummaries(tokenIds: number[]) {
    const result = new Map<number, { riskLevel: string; holderCount: number | null; priceUsd: string | null; liquidityUsd: string | null; fetchedAt: Date; findingCount: number }>();
    if (tokenIds.length === 0) return result;
    const rows = await this.rows(sql`
      select distinct on (s.token_id) s.token_id, s.risk_level, s.holder_count, s.price_usd::text as price_usd, s.liquidity_usd::text as liquidity_usd, s.fetched_at,
        (select count(*)::int from risk_findings f where f.snapshot_id = s.id) as finding_count
      from token_snapshots s
      where s.token_id in (${sql.join(
        tokenIds.map((id) => sql`${id}`),
        sql`, `,
      )})
      order by s.token_id, s.block_number desc`);
    for (const row of rows) {
      result.set(Number(row.token_id), {
        riskLevel: String(row.risk_level),
        holderCount: row.holder_count === null ? null : Number(row.holder_count),
        priceUsd: row.price_usd === null ? null : String(row.price_usd),
        liquidityUsd: row.liquidity_usd === null ? null : String(row.liquidity_usd),
        fetchedAt: new Date(row.fetched_at as string | Date),
        findingCount: Number(row.finding_count),
      });
    }
    return result;
  }

  /** Jumlah address tersimpan per label utama (chain, jenis, sumber, nama sumber). */
  async primaryLabelCounts(): Promise<PrimaryLabelCount[]> {
    const rows = await this.rows(sql`
      select a.chain_id, pl.label_type, pl.source, pl.source_name, count(*)::int as count
      from addresses a
      ${PRIMARY_LABEL(sql`a.id`)}
      where pl.label_type is not null
      group by a.chain_id, pl.label_type, pl.source, pl.source_name`);
    return rows.map((row) => ({
      chainId: String(row.chain_id),
      type: row.label_type as EntityLabelType,
      source: row.source as LabelSource,
      sourceName: String(row.source_name),
      count: Number(row.count),
    }));
  }

  /** Address yang riwayatnya sudah pernah dipindai. */
  async scannedAddressIds(addressIds: number[]): Promise<Set<number>> {
    if (addressIds.length === 0) return new Set();
    const rows = await this.db
      .selectDistinct({ addressId: addressFlowScans.addressId })
      .from(addressFlowScans)
      .where(and(inArray(addressFlowScans.addressId, addressIds), ne(addressFlowScans.status, 'unavailable')));
    return new Set(rows.map((row) => row.addressId));
  }

  private async rows(query: SQL): Promise<Raw[]> {
    const result = (await this.db.execute(query)) as unknown as { rows: Raw[] };
    return result.rows;
  }
}

function toIndexRow(row: Raw): IndexRow {
  return {
    kind: row.kind === 'token' ? 'token' : 'address',
    chainId: String(row.chain_id),
    addressId: Number(row.address_id),
    tokenId: row.token_id === null ? null : Number(row.token_id),
    title: String(row.title),
    subtitle: row.subtitle === null ? null : String(row.subtitle),
    address: String(row.address),
    label:
      row.label_type === null
        ? null
        : {
            type: String(row.label_type),
            name: row.label_name === null ? null : String(row.label_name),
            source: row.label_source as 'external' | 'heuristic' | 'user',
            sourceName: String(row.label_source_name),
          },
    rank: Number(row.rank),
  };
}
