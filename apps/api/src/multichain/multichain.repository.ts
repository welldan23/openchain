import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  addresses,
  addressFlowScans,
  bridgeTransfers,
  chains,
  infrastructureContracts,
  labels,
  multichainChainActivity,
  multichainScans,
  nativeTransfers,
  tokenTransfers,
} from '../database/schema/index.js';

type Raw = Record<string, unknown>;

/** Rentang yang dibaca untuk satu chain: cakupan blok pemindaian, dipotong waktu bila diminta. */
export interface ChainRange {
  chainId: string;
  addressId: number;
  blockFrom: number;
  blockTo: number;
  from?: Date;
  to?: Date;
}

export interface ChainStatsRow {
  txCount: number;
  counterpartyCount: number;
  firstSeen: Date | null;
  lastSeen: Date | null;
  inUsd: string | null;
  outUsd: string | null;
  inCount: number;
  outCount: number;
  /** Transfer tanpa harga saat transaksi; tidak ikut jumlah USD. */
  unpricedCount: number;
}

export interface ActivityRow {
  chainId: string;
  source: 'native' | 'internal' | 'token';
  id: number;
  txHash: string;
  direction: 'in' | 'out' | 'self';
  counterpartyId: number;
  amountRaw: string;
  amountUsd: string | null;
  blockNumber: number;
  timestamp: Date;
  tokenId: number | null;
}

function within(alias: string, range: ChainRange): SQL {
  const column = (name: string) => sql.raw(`${alias}.${name}`);
  return sql`${column('chain_id')} = ${range.chainId}
    and (${column('from_address_id')} = ${range.addressId} or ${column('to_address_id')} = ${range.addressId})
    and ${column('block_number')} between ${range.blockFrom} and ${range.blockTo}
    ${range.from ? sql`and ${column('block_timestamp')} >= ${range.from}` : sql``}
    ${range.to ? sql`and ${column('block_timestamp')} <= ${range.to}` : sql``}`;
}

/** Query baca aktivitas lintas chain, plus penyimpanan ringkasan pemindaiannya. */
@Injectable()
export class MultichainRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async evmChains() {
    return this.db.select().from(chains).where(eq(chains.family, 'evm'));
  }

  /** Address yang sama di beberapa chain (bentuk ternormalisasi sama). */
  async addressesOn(chainIds: string[], addressNormalized: string) {
    if (chainIds.length === 0) return [];
    return this.db
      .select({ id: addresses.id, chainId: addresses.chainId, address: addresses.address })
      .from(addresses)
      .where(and(inArray(addresses.chainId, chainIds), eq(addresses.addressNormalized, addressNormalized)));
  }

  async scansByIds(ids: number[]) {
    if (ids.length === 0) return [];
    return this.db.select().from(addressFlowScans).where(inArray(addressFlowScans.id, ids));
  }

  async chainStats(range: ChainRange): Promise<ChainStatsRow> {
    const address = range.addressId;
    const result = (await this.db.execute(sql`
      with moves as (
        select n.tx_hash, n.from_address_id, n.to_address_id, n.amount_usd, n.block_timestamp from native_transfers n where ${within('n', range)}
        union all
        select t.tx_hash, t.from_address_id, t.to_address_id, t.amount_usd, t.block_timestamp from token_transfers t where ${within('t', range)}
      )
      select count(distinct tx_hash)::int as tx_count,
        count(distinct case when from_address_id = ${address} then to_address_id else from_address_id end)
          filter (where from_address_id <> to_address_id)::int as counterparty_count,
        min(block_timestamp) as first_seen, max(block_timestamp) as last_seen,
        sum(amount_usd) filter (where to_address_id = ${address} and from_address_id <> ${address})::text as in_usd,
        sum(amount_usd) filter (where from_address_id = ${address} and to_address_id <> ${address})::text as out_usd,
        count(*) filter (where to_address_id = ${address} and from_address_id <> ${address})::int as in_count,
        count(*) filter (where from_address_id = ${address} and to_address_id <> ${address})::int as out_count,
        count(*) filter (where amount_usd is null and from_address_id <> to_address_id)::int as unpriced_count
      from moves`)) as unknown as { rows: Raw[] };
    const row = result.rows[0] ?? {};
    const date = (value: unknown) => (value === null || value === undefined ? null : new Date(value as string | Date));
    return {
      txCount: Number(row.tx_count ?? 0),
      counterpartyCount: Number(row.counterparty_count ?? 0),
      firstSeen: date(row.first_seen),
      lastSeen: date(row.last_seen),
      inUsd: row.in_usd === null || row.in_usd === undefined ? null : String(row.in_usd),
      outUsd: row.out_usd === null || row.out_usd === undefined ? null : String(row.out_usd),
      inCount: Number(row.in_count ?? 0),
      outCount: Number(row.out_count ?? 0),
      unpricedCount: Number(row.unpriced_count ?? 0),
    };
  }

  /** Transfer terbaru dulu dalam rentang, paling banyak `limit`. */
  async activities(range: ChainRange, limit: number): Promise<ActivityRow[]> {
    const address = range.addressId;
    const result = (await this.db.execute(sql`
      select * from (
        select case when n.kind = 'internal' then 'internal' else 'native' end as source, n.id, n.tx_hash, n.from_address_id, n.to_address_id,
          n.amount_raw::text as amount_raw, n.amount_usd::text as amount_usd, n.block_number, n.block_timestamp, null::bigint as token_id
        from native_transfers n where ${within('n', range)}
        union all
        select 'token', t.id, t.tx_hash, t.from_address_id, t.to_address_id, t.amount_raw::text, t.amount_usd::text, t.block_number, t.block_timestamp, t.token_id
        from token_transfers t where ${within('t', range)}
      ) moves
      order by block_number desc, source, id desc
      limit ${limit}`)) as unknown as { rows: Raw[] };
    return result.rows.map((row) => {
      const fromId = Number(row.from_address_id);
      const toId = Number(row.to_address_id);
      const direction = fromId === toId ? 'self' : toId === address ? 'in' : 'out';
      return {
        chainId: range.chainId,
        source: row.source === 'token' ? 'token' : row.source === 'internal' ? 'internal' : 'native',
        id: Number(row.id),
        txHash: String(row.tx_hash),
        direction,
        counterpartyId: direction === 'in' ? fromId : toId,
        amountRaw: String(row.amount_raw),
        amountUsd: row.amount_usd === null ? null : String(row.amount_usd),
        blockNumber: Number(row.block_number),
        timestamp: new Date(row.block_timestamp as string | Date),
        tokenId: row.token_id === null ? null : Number(row.token_id),
      };
    });
  }

  /** Address yang dikenali sebagai bridge, lewat label atau kontrak protokol bridge. */
  async bridgeAddressIds(addressIds: number[]): Promise<Set<number>> {
    if (addressIds.length === 0) return new Set();
    const [byLabel, byContract] = await Promise.all([
      this.db
        .selectDistinct({ addressId: labels.addressId })
        .from(labels)
        .where(and(inArray(labels.addressId, addressIds), eq(labels.labelType, 'bridge'))),
      this.db
        .selectDistinct({ addressId: infrastructureContracts.addressId })
        .from(infrastructureContracts)
        .where(and(inArray(infrastructureContracts.addressId, addressIds), inArray(infrastructureContracts.role, ['bridge_entry', 'bridge_exit', 'bridge_both']))),
    ]);
    return new Set([...byLabel, ...byContract].map((row) => row.addressId));
  }

  /** Perpindahan bridge yang dikirim atau diterima address ini. */
  async bridgeTransfersFor(addressIds: number[]) {
    if (addressIds.length === 0) return [];
    return this.db
      .select()
      .from(bridgeTransfers)
      .where(or(inArray(bridgeTransfers.senderAddressId, addressIds), inArray(bridgeTransfers.recipientAddressId, addressIds)))
      .orderBy(desc(bridgeTransfers.sentAt), desc(bridgeTransfers.id));
  }

  /** Hash transaksi transfer, per kunci `native:<id>` / `token:<id>`. */
  async transferHashes(nativeIds: number[], tokenIds: number[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (nativeIds.length > 0) {
      const rows = await this.db.select({ id: nativeTransfers.id, txHash: nativeTransfers.txHash }).from(nativeTransfers).where(inArray(nativeTransfers.id, nativeIds));
      for (const row of rows) result.set(`native:${row.id}`, row.txHash);
    }
    if (tokenIds.length > 0) {
      const rows = await this.db.select({ id: tokenTransfers.id, txHash: tokenTransfers.txHash }).from(tokenTransfers).where(inArray(tokenTransfers.id, tokenIds));
      for (const row of rows) result.set(`token:${row.id}`, row.txHash);
    }
    return result;
  }

  /** Pemindaian lintas chain terbaru untuk address ini, beserta baris per chain. */
  async latestScan(addressNormalized: string) {
    const [scan] = await this.db
      .select()
      .from(multichainScans)
      .where(and(eq(multichainScans.family, 'evm'), eq(multichainScans.addressNormalized, addressNormalized)))
      .orderBy(desc(multichainScans.scannedAt), desc(multichainScans.id))
      .limit(1);
    return scan ? { scan, rows: await this.scanRows(scan.id) } : null;
  }

  async findScan(scanId: number) {
    const [scan] = await this.db.select().from(multichainScans).where(eq(multichainScans.id, scanId)).limit(1);
    return scan ? { scan, rows: await this.scanRows(scan.id) } : null;
  }

  private async scanRows(scanId: number) {
    return this.db.select().from(multichainChainActivity).where(eq(multichainChainActivity.scanId, scanId)).orderBy(asc(multichainChainActivity.id));
  }

  async saveScan(
    scan: typeof multichainScans.$inferInsert,
    rows: ReadonlyArray<Omit<typeof multichainChainActivity.$inferInsert, 'scanId'>>,
  ) {
    return this.db.transaction(async (tx) => {
      const [saved] = await tx.insert(multichainScans).values(scan).returning();
      const savedRows = rows.length === 0 ? [] : await tx.insert(multichainChainActivity).values(rows.map((row) => ({ ...row, scanId: saved.id }))).returning();
      return { scan: saved, rows: savedRows };
    });
  }
}
