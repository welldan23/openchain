import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { addresses, chains, holders, labels, tokens, tokenSnapshots } from '../database/schema/index.js';
import { HUB_LABEL_TYPES } from '../flows/flows.repository.js';
import type { AddressProfile, GraphTransfer, HistoryCoverage, MapGraphLoader } from './map-graph.js';

type Raw = Record<string, unknown>;

/** Address yang menerima token yang dibakar atau mengirim token yang dicetak. */
const BURN_ADDRESSES = ['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead'];

function idList(ids: readonly number[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::bigint`),
    sql`, `,
  );
}

function toTransfer(row: Raw, source: GraphTransfer['source']): GraphTransfer {
  return {
    source,
    id: Number(row.id),
    fromId: Number(row.from_address_id),
    toId: Number(row.to_address_id),
    blockNumber: Number(row.block_number),
  };
}

/** Query baca untuk membentuk peta hubungan. Penulisan ada di `WalletMapBuilder`. */
@Injectable()
export class MapsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findChain(chainId: string) {
    const [chain] = await this.db.select().from(chains).where(eq(chains.id, chainId)).limit(1);
    return chain ?? null;
  }

  async findToken(chainId: string, addressNormalized: string) {
    const [row] = await this.db
      .select({ id: tokens.id, address: addresses.address, symbol: tokens.symbol })
      .from(tokens)
      .innerJoin(addresses, eq(tokens.addressId, addresses.id))
      .where(and(eq(tokens.chainId, chainId), eq(addresses.addressNormalized, addressNormalized)))
      .limit(1);
    return row ?? null;
  }

  /** Snapshot pada blok tertentu, atau yang terbaru. */
  async findSnapshot(tokenId: number, blockNumber?: number) {
    const [snapshot] = await this.db
      .select()
      .from(tokenSnapshots)
      .where(
        blockNumber === undefined
          ? eq(tokenSnapshots.tokenId, tokenId)
          : and(eq(tokenSnapshots.tokenId, tokenId), eq(tokenSnapshots.blockNumber, blockNumber)),
      )
      .orderBy(sql`${tokenSnapshots.blockNumber} desc`)
      .limit(1);
    return snapshot ?? null;
  }

  /** Holder teratas pada snapshot, urut peringkat. */
  async findHolders(snapshotId: number, limit: number) {
    return this.db
      .select({ addressId: holders.addressId, sharePct: holders.sharePct })
      .from(holders)
      .where(eq(holders.snapshotId, snapshotId))
      .orderBy(asc(holders.rank))
      .limit(limit);
  }

  /** Sumber data graf untuk satu token sampai blok peta. */
  loader(chainId: string, tokenId: number, blockNumber: number): MapGraphLoader {
    return {
      incomingFunding: (frontier, perAddress) => this.incomingFunding(chainId, blockNumber, frontier, perAddress),
      tokenTransfersAmong: (ids, perPair, limit) => this.tokenTransfersAmong(chainId, tokenId, blockNumber, ids, perPair, limit),
      connectorCandidates: (holderIds, limit) => this.connectorCandidates(chainId, tokenId, blockNumber, holderIds, limit),
      profiles: (ids) => this.profiles(ids),
      coverage: (ids) => this.coverage(chainId, blockNumber, ids),
    };
  }

  private async incomingFunding(
    chainId: string,
    mapBlock: number,
    frontier: ReadonlyArray<{ addressId: number; maxBlock: number }>,
    perAddress: number,
  ): Promise<GraphTransfer[]> {
    if (frontier.length === 0) return [];
    const values = sql.join(
      frontier.map((item) => sql`(${item.addressId}::bigint, ${Math.min(item.maxBlock, mapBlock)}::bigint)`),
      sql`, `,
    );
    const rows = await this.rows(sql`
      with frontier(address_id, max_block) as (values ${values}),
      ranked as (
        select n.id, n.kind, n.from_address_id, n.to_address_id, n.block_number,
          row_number() over (partition by n.to_address_id order by n.block_number, n.id) as rn
        from native_transfers n
        join frontier f on f.address_id = n.to_address_id and n.block_number <= f.max_block
        where n.chain_id = ${chainId} and n.from_address_id <> n.to_address_id
      )
      select * from ranked where rn <= ${perAddress} order by block_number, id`);
    return rows.map((row) => toTransfer(row, row.kind === 'internal' ? 'internal' : 'native'));
  }

  private async tokenTransfersAmong(
    chainId: string,
    tokenId: number,
    mapBlock: number,
    addressIds: number[],
    perPair: number,
    limit: number,
  ): Promise<GraphTransfer[]> {
    if (addressIds.length < 2 || limit <= 0) return [];
    const ids = idList(addressIds);
    const rows = await this.rows(sql`
      select * from (
        select t.id, t.from_address_id, t.to_address_id, t.block_number,
          row_number() over (partition by t.from_address_id, t.to_address_id order by t.block_number, t.log_index, t.id) as rn
        from token_transfers t
        where t.chain_id = ${chainId} and t.token_id = ${tokenId} and t.block_number <= ${mapBlock}
          and t.from_address_id in (${ids}) and t.to_address_id in (${ids})
          and t.from_address_id <> t.to_address_id
      ) ranked
      where rn <= ${perPair}
      order by block_number, id
      limit ${limit}`);
    return rows.map((row) => toTransfer(row, 'token'));
  }

  private async connectorCandidates(chainId: string, tokenId: number, mapBlock: number, holderIds: number[], limit: number) {
    if (holderIds.length < 2 || limit <= 0) return [];
    const ids = idList(holderIds);
    const rows = await this.rows(sql`
      with links as (
        select t.to_address_id as other, t.from_address_id as holder
        from token_transfers t
        where t.chain_id = ${chainId} and t.token_id = ${tokenId} and t.block_number <= ${mapBlock} and t.from_address_id in (${ids})
        union
        select t.from_address_id, t.to_address_id
        from token_transfers t
        where t.chain_id = ${chainId} and t.token_id = ${tokenId} and t.block_number <= ${mapBlock} and t.to_address_id in (${ids})
      )
      select other as address_id, count(distinct holder)::int as holder_count
      from links
      where other not in (${ids})
      group by other
      having count(distinct holder) >= 2
      order by holder_count desc, other
      limit ${limit}`);
    return rows.map((row) => ({ addressId: Number(row.address_id), holderCount: Number(row.holder_count) }));
  }

  private async profiles(addressIds: number[]): Promise<Map<number, AddressProfile>> {
    const result = new Map<number, AddressProfile>();
    if (addressIds.length === 0) return result;
    const rows = await this.db
      .select({ id: addresses.id, normalized: addresses.addressNormalized, isContract: addresses.isContract })
      .from(addresses)
      .where(inArray(addresses.id, addressIds));
    const hubs = await this.db
      .selectDistinct({ addressId: labels.addressId })
      .from(labels)
      .where(and(inArray(labels.addressId, addressIds), inArray(labels.labelType, [...HUB_LABEL_TYPES])));
    const hubIds = new Set(hubs.map((row) => row.addressId));
    for (const row of rows) {
      result.set(row.id, { isContract: row.isContract, hub: hubIds.has(row.id), burn: BURN_ADDRESSES.includes(row.normalized) });
    }
    return result;
  }

  /**
   * Lengkap bila ada pemindaian yang membaca native, internal, dan token dari
   * awal riwayat (blok 0) sampai minimal blok peta.
   */
  private async coverage(chainId: string, mapBlock: number, addressIds: number[]): Promise<Map<number, HistoryCoverage>> {
    const result = new Map<number, HistoryCoverage>();
    if (addressIds.length === 0) return result;
    const rows = await this.rows(sql`
      select address_id,
        bool_or(native_scanned and internal_scanned and tokens_scanned and block_from = 0 and block_to >= ${mapBlock}) as full
      from address_flow_scans
      where chain_id = ${chainId} and address_id in (${idList(addressIds)}) and status <> 'unavailable'
      group by address_id`);
    for (const row of rows) result.set(Number(row.address_id), row.full === true ? 'full' : 'partial');
    return result;
  }

  private async rows(query: SQL): Promise<Raw[]> {
    const result = (await this.db.execute(query)) as unknown as { rows: Raw[] };
    return result.rows;
  }
}
