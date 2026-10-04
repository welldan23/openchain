import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, lte, ne, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DATABASE, type Database } from '../database/database.module.js';
import type { EntityLabelType } from '../database/schema/enums.js';
import {
  addresses,
  addressFlowScans,
  chains,
  evidence,
  labels,
  movementClassifications,
  providerRuns,
  tokens,
  transactions,
} from '../database/schema/index.js';
import type { EvidenceRecord } from '../tokens/evidence.view.js';
import type { TraceEdge } from './trace-search.js';

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

/** Transfer keluar sebagai calon langkah jalur, beserta detail untuk respons. */
export interface TraceEdgeRow extends TraceEdge {
  source: 'native' | 'internal' | 'token';
  /** Id baris di tabel transfer (native untuk `native`/`internal`). */
  id: number;
  txHash: string;
  amountRaw: string;
  amountUsd: string | null;
  tokenId: number | null;
}

/** Posisi terakhir halaman daftar transfer (urutan terbaru dulu). */
export interface TransferCursor {
  blockNumber: number;
  sourceRank: number;
  id: number;
}

export interface TransferRow {
  source: 'native' | 'internal' | 'token';
  sourceRank: number;
  id: number;
  txHash: string;
  fromId: number;
  toId: number;
  amountRaw: string;
  amountUsd: string | null;
  blockNumber: number;
  timestamp: Date;
  tokenId: number | null;
}

/**
 * Jenis label yang menandai hub: dana dari banyak orang tercampur di sana,
 * jadi jalur yang lewat hub belum tentu dana yang sama.
 */
export const HUB_LABEL_TYPES: readonly EntityLabelType[] = ['exchange', 'router', 'bridge', 'liquidity_pool', 'market_maker'];

/** Query baca untuk aliran dana. Tidak ada operasi tulis di sini. */
@Injectable()
export class FlowsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findChain(chainId: string) {
    const [chain] = await this.db.select().from(chains).where(eq(chains.id, chainId)).limit(1);
    return chain ?? null;
  }

  async listChains() {
    return this.db.select().from(chains);
  }

  /** Jumlah transfer (native dan token) yang melibatkan address dalam rentang blok. */
  async countTransfers(chainId: string, addressId: number, blockFrom: number, blockTo: number): Promise<number> {
    const [row] = await this.rows(sql`
      select
        (select count(*) from native_transfers n where n.chain_id = ${chainId}
          and (n.from_address_id = ${addressId} or n.to_address_id = ${addressId})
          and n.block_number between ${blockFrom} and ${blockTo})
        + (select count(*) from token_transfers t where t.chain_id = ${chainId}
          and (t.from_address_id = ${addressId} or t.to_address_id = ${addressId})
          and t.block_number between ${blockFrom} and ${blockTo}) as total`);
    return Number(row?.total ?? 0);
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

  /**
   * Transfer keluar (native dan token) dari tiap address frontier, mulai blok
   * minimumnya, paling awal dulu, paling banyak `perAddress` per address.
   */
  async outgoingEdges(
    chainId: string,
    frontier: ReadonlyArray<{ addressId: number; minBlock: number }>,
    perAddress: number,
  ): Promise<TraceEdgeRow[]> {
    if (frontier.length === 0) return [];
    const values = sql.join(
      frontier.map((item) => sql`(${item.addressId}::bigint, ${item.minBlock}::bigint)`),
      sql`, `,
    );
    const rows = await this.rows(sql`
      with frontier(address_id, min_block) as (values ${values}),
      moves as (
        select case when n.kind = 'internal' then 'internal' else 'native' end as source, n.id, n.tx_hash,
          n.from_address_id, n.to_address_id, n.amount_raw::text as amount_raw, n.amount_usd::text as amount_usd,
          n.block_number, n.block_timestamp, null::bigint as token_id
        from native_transfers n
        join frontier f on f.address_id = n.from_address_id and n.block_number >= f.min_block
        where n.chain_id = ${chainId} and n.from_address_id <> n.to_address_id
        union all
        select 'token', t.id, t.tx_hash, t.from_address_id, t.to_address_id, t.amount_raw::text, t.amount_usd::text,
          t.block_number, t.block_timestamp, t.token_id
        from token_transfers t
        join frontier f on f.address_id = t.from_address_id and t.block_number >= f.min_block
        where t.chain_id = ${chainId} and t.from_address_id <> t.to_address_id
      ),
      ranked as (
        select moves.*, row_number() over (partition by from_address_id order by block_number, source, id) as rn
        from moves
      )
      select * from ranked where rn <= ${perAddress} order by block_number, source, id`);
    return rows.map((row) => ({
      key: `${String(row.source)}:${String(row.id)}`,
      id: Number(row.id),
      source: row.source === 'token' ? 'token' : row.source === 'internal' ? 'internal' : 'native',
      fromId: Number(row.from_address_id),
      toId: Number(row.to_address_id),
      blockNumber: Number(row.block_number),
      timestamp: new Date(row.block_timestamp as string | Date),
      txHash: String(row.tx_hash),
      amountRaw: String(row.amount_raw),
      amountUsd: row.amount_usd === null ? null : String(row.amount_usd),
      tokenId: row.token_id === null ? null : Number(row.token_id),
    }));
  }

  /**
   * Transfer yang melibatkan address dalam rentang, terbaru dulu. Halaman
   * berikutnya memakai cursor keyset (blok, jenis, id) supaya stabil walau
   * ada data baru. `direction` `self` = transfer ke diri sendiri.
   */
  async listTransfers(
    chainId: string,
    addressId: number,
    range: FlowRange,
    options: { direction: 'in' | 'out' | null; limit: number; cursor: TransferCursor | null },
  ): Promise<TransferRow[]> {
    const within = (alias: string) => sql`
      ${sql.raw(alias)}.chain_id = ${chainId}
      and (${sql.raw(alias)}.from_address_id = ${addressId} or ${sql.raw(alias)}.to_address_id = ${addressId})
      and ${sql.raw(alias)}.block_number between ${range.blockFrom} and ${range.blockTo}
      and ${sql.raw(alias)}.block_timestamp between ${range.from.toISOString()}::timestamptz and ${range.to.toISOString()}::timestamptz`;
    const filters: SQL[] = [];
    if (options.direction === 'in') filters.push(sql`to_address_id = ${addressId} and from_address_id <> ${addressId}`);
    if (options.direction === 'out') filters.push(sql`from_address_id = ${addressId} and to_address_id <> ${addressId}`);
    if (options.cursor) {
      const { blockNumber, sourceRank, id } = options.cursor;
      filters.push(sql`(block_number, source_rank, id) < (${blockNumber}::bigint, ${sourceRank}::int, ${id}::bigint)`);
    }
    const where = filters.length > 0 ? sql`where ${sql.join(filters, sql` and `)}` : sql``;
    const rows = await this.rows(sql`
      with moves as (
        select case when n.kind = 'internal' then 'internal' else 'native' end as source,
          case when n.kind = 'internal' then 1 else 0 end as source_rank,
          n.id, n.tx_hash, n.from_address_id, n.to_address_id, n.amount_raw::text as amount_raw,
          n.amount_usd::text as amount_usd, n.block_number, n.block_timestamp, null::bigint as token_id
        from native_transfers n where ${within('n')}
        union all
        select 'token', 2, t.id, t.tx_hash, t.from_address_id, t.to_address_id, t.amount_raw::text, t.amount_usd::text,
          t.block_number, t.block_timestamp, t.token_id
        from token_transfers t where ${within('t')}
      )
      select * from moves ${where}
      order by block_number desc, source_rank desc, id desc
      limit ${options.limit}`);
    return rows.map((row) => ({
      source: row.source === 'token' ? 'token' : row.source === 'internal' ? 'internal' : 'native',
      sourceRank: Number(row.source_rank),
      id: Number(row.id),
      txHash: String(row.tx_hash),
      fromId: Number(row.from_address_id),
      toId: Number(row.to_address_id),
      amountRaw: String(row.amount_raw),
      amountUsd: row.amount_usd === null ? null : String(row.amount_usd),
      blockNumber: Number(row.block_number),
      timestamp: new Date(row.block_timestamp as string | Date),
      tokenId: row.token_id === null ? null : Number(row.token_id),
    }));
  }

  /**
   * Semua perpindahan dana tersimpan dalam satu transaksi: nilai transaksi,
   * panggilan internal (urut trace), lalu transfer token (urut log).
   */
  async movementsByTx(chainId: string, txHash: string) {
    // ORDER BY dengan ekspresi tidak boleh langsung di UNION, jadi dibungkus subquery.
    const rows = await this.rows(sql`
      select * from (
      select case when n.kind = 'internal' then 'internal' else 'native' end as source,
        case when n.kind = 'internal' then 1 else 0 end as source_rank,
        n.id, n.trace_path as position, null::int as log_index, n.from_address_id, n.to_address_id,
        n.amount_raw::text as amount_raw, n.amount_usd::text as amount_usd, n.block_number, n.block_timestamp,
        null::bigint as token_id, n.provider_run_id
      from native_transfers n where n.chain_id = ${chainId} and n.tx_hash = ${txHash}
      union all
      select 'token', 2, t.id, t.log_index::text, t.log_index, t.from_address_id, t.to_address_id,
        t.amount_raw::text, t.amount_usd::text, t.block_number, t.block_timestamp, t.token_id, t.provider_run_id
      from token_transfers t where t.chain_id = ${chainId} and t.tx_hash = ${txHash}
      ) moves
      order by source_rank, log_index nulls first, length(position), position, id`);
    return rows.map((row) => ({
      source: (row.source === 'token' ? 'token' : row.source === 'internal' ? 'internal' : 'native') as 'native' | 'internal' | 'token',
      id: Number(row.id),
      position: String(row.position),
      fromId: Number(row.from_address_id),
      toId: Number(row.to_address_id),
      amountRaw: String(row.amount_raw),
      amountUsd: row.amount_usd === null ? null : String(row.amount_usd),
      blockNumber: Number(row.block_number),
      timestamp: new Date(row.block_timestamp as string | Date),
      tokenId: row.token_id === null ? null : Number(row.token_id),
      providerRunId: row.provider_run_id === null ? null : Number(row.provider_run_id),
    }));
  }

  /** Detail transaksi bila sudah diambil (dari ingest token). */
  async findTransaction(chainId: string, txHash: string) {
    const from = alias(addresses, 'tx_from');
    const to = alias(addresses, 'tx_to');
    const [row] = await this.db
      .select({ transaction: transactions, from: from.address, to: to.address })
      .from(transactions)
      .leftJoin(from, eq(transactions.fromAddressId, from.id))
      .leftJoin(to, eq(transactions.toAddressId, to.id))
      .where(and(eq(transactions.chainId, chainId), eq(transactions.hash, txHash)))
      .limit(1);
    return row ?? null;
  }

  /** Bukti (klaim analisis) yang menunjuk hash transaksi ini. */
  async evidenceByTx(chainId: string, txHash: string): Promise<EvidenceRecord[]> {
    const source = alias(addresses, 'source');
    const destination = alias(addresses, 'destination');
    const contract = alias(addresses, 'contract');
    return this.db
      .select({ evidence, sourceAddress: source.address, destinationAddress: destination.address, contractAddress: contract.address })
      .from(evidence)
      .leftJoin(source, eq(evidence.sourceAddressId, source.id))
      .leftJoin(destination, eq(evidence.destinationAddressId, destination.id))
      .leftJoin(contract, eq(evidence.contractAddressId, contract.id))
      .where(and(eq(evidence.chainId, chainId), eq(evidence.txHash, txHash)))
      .orderBy(asc(evidence.id));
  }

  async providerRunsByIds(runIds: number[]) {
    if (runIds.length === 0) return [];
    return this.db.select().from(providerRuns).where(inArray(providerRuns.id, runIds)).orderBy(asc(providerRuns.id));
  }

  /**
   * Jenis perpindahan yang tersimpan, dikunci `native:<id>` atau `token:<id>`
   * (transfer internal tersimpan sebagai native).
   */
  async movementTypesFor(refs: ReadonlyArray<{ source: 'native' | 'internal' | 'token'; id: number }>) {
    const result = new Map<string, typeof movementClassifications.$inferSelect>();
    const nativeIds = refs.filter((ref) => ref.source !== 'token').map((ref) => ref.id);
    const tokenIds = refs.filter((ref) => ref.source === 'token').map((ref) => ref.id);
    if (nativeIds.length > 0) {
      const rows = await this.db.select().from(movementClassifications).where(inArray(movementClassifications.nativeTransferId, nativeIds));
      for (const row of rows) result.set(`native:${row.nativeTransferId}`, row);
    }
    if (tokenIds.length > 0) {
      const rows = await this.db.select().from(movementClassifications).where(inArray(movementClassifications.tokenTransferId, tokenIds));
      for (const row of rows) result.set(`token:${row.tokenTransferId}`, row);
    }
    return result;
  }

  /** Id address yang berlabel hub. */
  async hubAddressIds(addressIds: number[]): Promise<Set<number>> {
    if (addressIds.length === 0) return new Set();
    const rows = await this.db
      .selectDistinct({ addressId: labels.addressId })
      .from(labels)
      .where(and(inArray(labels.addressId, addressIds), inArray(labels.labelType, [...HUB_LABEL_TYPES])));
    return new Set(rows.map((row) => row.addressId));
  }

  /** Address yang punya setidaknya satu pemindaian yang bisa dipakai. */
  async scannedAddressIds(chainId: string, addressIds: number[]): Promise<Set<number>> {
    if (addressIds.length === 0) return new Set();
    const rows = await this.db
      .selectDistinct({ addressId: addressFlowScans.addressId })
      .from(addressFlowScans)
      .where(
        and(
          eq(addressFlowScans.chainId, chainId),
          inArray(addressFlowScans.addressId, addressIds),
          ne(addressFlowScans.status, 'unavailable'),
        ),
      );
    return new Set(rows.map((row) => row.addressId));
  }

  async addressesByIds(addressIds: number[]) {
    if (addressIds.length === 0) return new Map<number, string>();
    const rows = await this.db
      .select({ id: addresses.id, address: addresses.address })
      .from(addresses)
      .where(inArray(addresses.id, addressIds));
    return new Map(rows.map((row) => [row.id, row.address]));
  }

  async labelsByAddressIds(addressIds: number[]) {
    const grouped = new Map<number, (typeof labels.$inferSelect)[]>();
    if (addressIds.length === 0) return grouped;
    const rows = await this.db.select().from(labels).where(inArray(labels.addressId, addressIds)).orderBy(asc(labels.id));
    for (const row of rows) grouped.set(row.addressId, [...(grouped.get(row.addressId) ?? []), row]);
    return grouped;
  }

  /** Metadata token beserta address kontraknya. */
  async tokensByIds(tokenIds: number[]) {
    if (tokenIds.length === 0) return new Map<number, { address: string; symbol: string | null; name: string | null; decimals: number | null }>();
    const rows = await this.db
      .select({ id: tokens.id, address: addresses.address, symbol: tokens.symbol, name: tokens.name, decimals: tokens.decimals })
      .from(tokens)
      .innerJoin(addresses, eq(addresses.id, tokens.addressId))
      .where(inArray(tokens.id, tokenIds));
    return new Map(rows.map(({ id, ...token }) => [id, token]));
  }

  private async rows(query: SQL): Promise<Raw[]> {
    const result = (await this.db.execute(query)) as unknown as { rows: Raw[] };
    return result.rows;
  }
}
