import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, lte, ne, sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { addresses, addressFlowScans, chains, labels } from '../database/schema/index.js';

export type ScanRow = typeof addressFlowScans.$inferSelect;

/** Pilih pemindaian: per id, atau yang terakhir sampai waktu tertentu. */
export interface ScanSelector {
  scanId?: number;
  at?: Date;
}

/** Rentang yang diringkas: blok dari cakupan pemindaian, waktu hasil irisan. */
export interface FlowRange {
  blockFrom: number;
  blockTo: number;
  from: Date;
  to: Date;
}

export interface SideRow {
  direction: 'in' | 'out';
  transferCount: number;
  amountRaw: string;
  amountUsd: string | null;
  pricedCount: number;
}

export interface TokenSideRow extends SideRow {
  tokenId: number;
  tokenAddress: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
}

export interface FlowAggregates {
  native: SideRow[];
  tokens: TokenSideRow[];
  counterparties: { in: number; out: number; all: number };
  selfTransferCount: number;
}

type Raw = Record<string, unknown>;

/** Query baca untuk aliran dana. Tidak ada operasi tulis di sini. */
@Injectable()
export class FlowsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findChain(chainId: string) {
    const [chain] = await this.db.select().from(chains).where(eq(chains.id, chainId)).limit(1);
    return chain ?? null;
  }

  async findAddress(chainId: string, addressNormalized: string) {
    const [row] = await this.db
      .select({ id: addresses.id, address: addresses.address })
      .from(addresses)
      .where(and(eq(addresses.chainId, chainId), eq(addresses.addressNormalized, addressNormalized)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Pemindaian yang bisa dipakai (bukan `unavailable`): per id, atau yang
   * terakhir sampai waktu tertentu, atau yang terbaru.
   */
  async findScan(chainId: string, addressId: number, selector: ScanSelector = {}): Promise<ScanRow | null> {
    const filters: SQL[] = [eq(addressFlowScans.chainId, chainId), eq(addressFlowScans.addressId, addressId)];
    if (selector.scanId !== undefined) filters.push(eq(addressFlowScans.id, selector.scanId));
    else filters.push(ne(addressFlowScans.status, 'unavailable'));
    if (selector.at !== undefined) filters.push(lte(addressFlowScans.scannedAt, selector.at));
    const [row] = await this.db
      .select()
      .from(addressFlowScans)
      .where(and(...filters))
      .orderBy(desc(addressFlowScans.scannedAt), desc(addressFlowScans.id))
      .limit(1);
    return row ?? null;
  }

  /** Percobaan gagal terbaru setelah `after` (dan sampai `at` bila diisi). */
  async findFailedAttemptAfter(chainId: string, addressId: number, after: Date | null, at?: Date): Promise<ScanRow | null> {
    const filters: SQL[] = [
      eq(addressFlowScans.chainId, chainId),
      eq(addressFlowScans.addressId, addressId),
      eq(addressFlowScans.status, 'unavailable'),
    ];
    if (after) filters.push(gt(addressFlowScans.scannedAt, after));
    if (at) filters.push(lte(addressFlowScans.scannedAt, at));
    const [row] = await this.db
      .select()
      .from(addressFlowScans)
      .where(and(...filters))
      .orderBy(desc(addressFlowScans.scannedAt), desc(addressFlowScans.id))
      .limit(1);
    return row ?? null;
  }

  async findLabels(addressId: number) {
    return this.db.select().from(labels).where(eq(labels.addressId, addressId)).orderBy(asc(labels.id));
  }

  /**
   * Total masuk dan keluar per aset, lawan transaksi unik, dan transfer ke
   * diri sendiri dalam rentang. Penjumlahan dilakukan di database sebagai
   * numeric supaya presisi uint256 terjaga.
   */
  async aggregate(chainId: string, addressId: number, range: FlowRange): Promise<FlowAggregates> {
    const within = (table: string) => sql`
      ${sql.raw(table)}.chain_id = ${chainId}
      and (${sql.raw(table)}.from_address_id = ${addressId} or ${sql.raw(table)}.to_address_id = ${addressId})
      and ${sql.raw(table)}.block_number between ${range.blockFrom} and ${range.blockTo}
      and ${sql.raw(table)}.block_timestamp between ${range.from.toISOString()}::timestamptz and ${range.to.toISOString()}::timestamptz`;
    const direction = (table: string) =>
      sql`case when ${sql.raw(table)}.to_address_id = ${addressId} then 'in' else 'out' end`;
    const sums = sql`count(*)::int as transfer_count,
      coalesce(sum(amount_raw), 0)::text as amount_raw,
      sum(amount_usd)::text as amount_usd,
      count(amount_usd)::int as priced_count`;

    const native = await this.rows(sql`
      select ${direction('native_transfers')} as direction, ${sums}
      from native_transfers
      where ${within('native_transfers')} and native_transfers.from_address_id <> native_transfers.to_address_id
      group by 1`);

    const tokens = await this.rows(sql`
      select ${direction('token_transfers')} as direction, ${sums},
        tokens.id as token_id, token_address.address as token_address,
        tokens.symbol, tokens.name, tokens.decimals
      from token_transfers
      join tokens on tokens.id = token_transfers.token_id
      join addresses token_address on token_address.id = tokens.address_id
      where ${within('token_transfers')} and token_transfers.from_address_id <> token_transfers.to_address_id
      group by 1, tokens.id, token_address.address, tokens.symbol, tokens.name, tokens.decimals`);

    const [counterparties] = await this.rows(sql`
      with moves as (
        select ${direction('native_transfers')} as direction,
          case when native_transfers.to_address_id = ${addressId} then native_transfers.from_address_id else native_transfers.to_address_id end as counterparty
        from native_transfers
        where ${within('native_transfers')} and native_transfers.from_address_id <> native_transfers.to_address_id
        union all
        select ${direction('token_transfers')},
          case when token_transfers.to_address_id = ${addressId} then token_transfers.from_address_id else token_transfers.to_address_id end
        from token_transfers
        where ${within('token_transfers')} and token_transfers.from_address_id <> token_transfers.to_address_id
      )
      select
        (count(distinct counterparty) filter (where direction = 'in'))::int as in_count,
        (count(distinct counterparty) filter (where direction = 'out'))::int as out_count,
        count(distinct counterparty)::int as all_count
      from moves`);

    const [self] = await this.rows(sql`
      select
        (select count(*) from native_transfers where ${within('native_transfers')} and native_transfers.from_address_id = native_transfers.to_address_id)::int
        + (select count(*) from token_transfers where ${within('token_transfers')} and token_transfers.from_address_id = token_transfers.to_address_id)::int
        as self_count`);

    const side = (row: Raw): SideRow => ({
      direction: row.direction === 'in' ? 'in' : 'out',
      transferCount: Number(row.transfer_count),
      amountRaw: String(row.amount_raw),
      amountUsd: row.amount_usd === null ? null : String(row.amount_usd),
      pricedCount: Number(row.priced_count),
    });
    return {
      native: native.map(side),
      tokens: tokens.map((row) => ({
        ...side(row),
        tokenId: Number(row.token_id),
        tokenAddress: String(row.token_address),
        symbol: (row.symbol as string | null) ?? null,
        name: (row.name as string | null) ?? null,
        decimals: row.decimals === null ? null : Number(row.decimals),
      })),
      counterparties: {
        in: Number(counterparties?.in_count ?? 0),
        out: Number(counterparties?.out_count ?? 0),
        all: Number(counterparties?.all_count ?? 0),
      },
      selfTransferCount: Number(self?.self_count ?? 0),
    };
  }

  private async rows(query: SQL): Promise<Raw[]> {
    const result = (await this.db.execute(query)) as unknown as { rows: Raw[] };
    return result.rows;
  }
}
