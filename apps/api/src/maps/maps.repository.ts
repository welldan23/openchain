import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, gte, inArray, sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  addresses,
  addressFlowScans,
  chains,
  holders,
  labels,
  mapClusterMembers,
  mapClusters,
  mapClusterSignals,
  mapNodes,
  providerRuns,
  tokens,
  tokenSnapshotSources,
  tokenSnapshots,
  walletMaps,
} from '../database/schema/index.js';
import { HUB_LABEL_TYPES } from '../flows/flows.repository.js';
import type { AddressProfile, GraphTransfer, HistoryCoverage, MapGraphLoader } from './map-graph.js';
import type { ClusterLoader, EvidenceTransfer } from './wallet-clustering.js';

type Raw = Record<string, unknown>;

/** Address yang menerima token yang dibakar atau mengirim token yang dicetak. */
const BURN_ADDRESSES = ['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead'];

function idList(ids: readonly number[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::bigint`),
    sql`, `,
  );
}

/** Transfer yang menjadi bukti garis: tabel native (termasuk internal) atau token. */
export interface TransferRef {
  table: 'native' | 'token';
  id: number;
}

function transferFilter(edge: TransferRef): SQL {
  return edge.table === 'token' ? sql`e.token_transfer_id = ${edge.id}` : sql`e.native_transfer_id = ${edge.id}`;
}

/** Batas transfer bukti per pengecekan sinyal, supaya respons tetap kecil. */
const CLUSTER_EVIDENCE_LIMIT = 200;

function toEvidence(row: Raw, table: 'native' | 'token'): EvidenceTransfer {
  return {
    table,
    id: Number(row.id),
    fromAddressId: Number(row.from_address_id),
    toAddressId: Number(row.to_address_id),
    blockNumber: Number(row.block_number),
    timestamp: new Date(row.block_timestamp as string | Date),
  };
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

/** Garis peta beserta transfer yang menjadi buktinya. */
export interface MapEdgeRow {
  edgeId: number;
  kind: 'funding' | 'token_transfer';
  fromNodeId: number;
  toNodeId: number;
  source: 'native' | 'internal' | 'token';
  transferId: number;
  txHash: string;
  amountRaw: string;
  amountUsd: string | null;
  blockNumber: number;
  timestamp: Date;
  tokenId: number | null;
}

/** Query baca untuk membentuk dan membuka peta hubungan. Penulisan ada di `WalletMapBuilder`. */
@Injectable()
export class MapsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findChain(chainId: string) {
    const [chain] = await this.db.select().from(chains).where(eq(chains.id, chainId)).limit(1);
    return chain ?? null;
  }

  async findToken(chainId: string, addressNormalized: string) {
    const [row] = await this.db
      .select({
        id: tokens.id,
        address: addresses.address,
        name: tokens.name,
        symbol: tokens.symbol,
        decimals: tokens.decimals,
        deployerAddressId: tokens.deployerAddressId,
      })
      .from(tokens)
      .innerJoin(addresses, eq(tokens.addressId, addresses.id))
      .where(and(eq(tokens.chainId, chainId), eq(addresses.addressNormalized, addressNormalized)))
      .limit(1);
    return row ?? null;
  }

  async findTokenById(tokenId: number) {
    const [row] = await this.db
      .select({ id: tokens.id, deployerAddressId: tokens.deployerAddressId })
      .from(tokens)
      .where(eq(tokens.id, tokenId))
      .limit(1);
    return row ?? null;
  }

  /** Peta terbaru sebuah token, apa pun parameternya. */
  async findLatestMap(tokenId: number) {
    const [map] = await this.db
      .select()
      .from(walletMaps)
      .where(eq(walletMaps.tokenId, tokenId))
      .orderBy(desc(walletMaps.builtAt), desc(walletMaps.id))
      .limit(1);
    return map ?? null;
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

  async findSnapshotById(snapshotId: number) {
    const [snapshot] = await this.db.select().from(tokenSnapshots).where(eq(tokenSnapshots.id, snapshotId)).limit(1);
    return snapshot ?? null;
  }

  /** Nama provider yang dipakai membentuk snapshot. */
  async snapshotSources(snapshotId: number): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ provider: providerRuns.provider })
      .from(tokenSnapshotSources)
      .innerJoin(providerRuns, eq(tokenSnapshotSources.providerRunId, providerRuns.id))
      .where(eq(tokenSnapshotSources.snapshotId, snapshotId))
      .orderBy(asc(providerRuns.provider));
    return rows.map((row) => row.provider);
  }

  async findMap(mapId: number) {
    const [map] = await this.db.select().from(walletMaps).where(eq(walletMaps.id, mapId)).limit(1);
    return map ?? null;
  }

  /** Peta terbaru dari snapshot ini dengan jumlah holder sama dan kedalaman cukup. */
  async findReusableMap(snapshotId: number, holderLimit: number, minDepth: number) {
    const [map] = await this.db
      .select()
      .from(walletMaps)
      .where(and(eq(walletMaps.snapshotId, snapshotId), eq(walletMaps.holderLimit, holderLimit), gte(walletMaps.fundingDepth, minDepth)))
      .orderBy(desc(walletMaps.builtAt), desc(walletMaps.id))
      .limit(1);
    return map ?? null;
  }

  /** Ada pemindaian aliran dana di chain ini sesudah waktu tertentu. */
  async hasScanAfter(chainId: string, after: Date): Promise<boolean> {
    const [row] = await this.db
      .select({ id: addressFlowScans.id })
      .from(addressFlowScans)
      .where(and(eq(addressFlowScans.chainId, chainId), gt(addressFlowScans.scannedAt, after)))
      .limit(1);
    return row !== undefined;
  }

  /** Node peta, atau hanya node tertentu bila `nodeIds` diisi. */
  async mapNodes(mapId: number, nodeIds?: number[]) {
    return this.db
      .select({
        id: mapNodes.id,
        addressId: mapNodes.addressId,
        address: addresses.address,
        role: mapNodes.role,
        sharePct: mapNodes.sharePct,
        isContract: mapNodes.isContract,
      })
      .from(mapNodes)
      .innerJoin(addresses, eq(mapNodes.addressId, addresses.id))
      .where(nodeIds === undefined ? eq(mapNodes.mapId, mapId) : and(eq(mapNodes.mapId, mapId), inArray(mapNodes.id, nodeIds)))
      .orderBy(asc(mapNodes.id));
  }

  /** Garis peta, bisa disaring dengan kondisi tambahan atas alias `e`. */
  async mapEdges(mapId: number, filter?: SQL): Promise<MapEdgeRow[]> {
    const rows = await this.rows(sql`
      select e.id as edge_id, e.kind, e.from_node_id, e.to_node_id,
        case when e.token_transfer_id is not null then 'token' when n.kind = 'internal' then 'internal' else 'native' end as source,
        coalesce(e.native_transfer_id, e.token_transfer_id) as transfer_id,
        coalesce(n.tx_hash, t.tx_hash) as tx_hash,
        coalesce(n.amount_raw, t.amount_raw)::text as amount_raw,
        coalesce(n.amount_usd, t.amount_usd)::text as amount_usd,
        coalesce(n.block_number, t.block_number) as block_number,
        coalesce(n.block_timestamp, t.block_timestamp) as block_timestamp,
        t.token_id
      from map_edges e
      left join native_transfers n on n.id = e.native_transfer_id
      left join token_transfers t on t.id = e.token_transfer_id
      where e.map_id = ${mapId} ${filter ? sql`and ${filter}` : sql``}
      order by e.id`);
    return rows.map((row) => ({
      edgeId: Number(row.edge_id),
      kind: row.kind === 'token_transfer' ? 'token_transfer' : 'funding',
      fromNodeId: Number(row.from_node_id),
      toNodeId: Number(row.to_node_id),
      source: row.source === 'token' ? 'token' : row.source === 'internal' ? 'internal' : 'native',
      transferId: Number(row.transfer_id),
      txHash: String(row.tx_hash),
      amountRaw: String(row.amount_raw),
      amountUsd: row.amount_usd === null ? null : String(row.amount_usd),
      blockNumber: Number(row.block_number),
      timestamp: new Date(row.block_timestamp as string | Date),
      tokenId: row.token_id === null ? null : Number(row.token_id),
    }));
  }

  /** Garis peta untuk satu transfer; `null` bila transfer itu bukan garis di peta ini. */
  async findMapEdge(mapId: number, edge: TransferRef): Promise<MapEdgeRow | null> {
    const [row] = await this.mapEdges(mapId, transferFilter(edge));
    return row ?? null;
  }

  /** Semua garis di antara dua node, ke dua arah. */
  async edgesBetween(mapId: number, nodeA: number, nodeB: number): Promise<MapEdgeRow[]> {
    return this.mapEdges(
      mapId,
      sql`((e.from_node_id = ${nodeA} and e.to_node_id = ${nodeB}) or (e.from_node_id = ${nodeB} and e.to_node_id = ${nodeA}))`,
    );
  }

  /** Peta terbaru token ini yang memuat transfer tersebut sebagai garis. */
  async findLatestMapWithEdge(tokenId: number, edge: TransferRef) {
    const rows = await this.rows(sql`
      select m.id from wallet_maps m
      join map_edges e on e.map_id = m.id
      where m.token_id = ${tokenId} and ${transferFilter(edge)}
      order by m.built_at desc, m.id desc
      limit 1`);
    return rows.length === 0 ? null : this.findMap(Number(rows[0].id));
  }

  /** Kelompok tersimpan sebuah peta beserta anggota, sinyal, dan bukti transfernya. */
  async storedClusters(mapId: number) {
    const clusters = await this.db.select().from(mapClusters).where(eq(mapClusters.mapId, mapId)).orderBy(asc(mapClusters.id));
    if (clusters.length === 0) return [];
    const clusterIds = clusters.map((cluster) => cluster.id);
    const [members, signals] = await Promise.all([
      this.db
        .select({ clusterId: mapClusterMembers.clusterId, nodeId: mapClusterMembers.nodeId })
        .from(mapClusterMembers)
        .where(inArray(mapClusterMembers.clusterId, clusterIds))
        .orderBy(asc(mapClusterMembers.nodeId)),
      this.db
        .select()
        .from(mapClusterSignals)
        .where(inArray(mapClusterSignals.clusterId, clusterIds))
        .orderBy(asc(mapClusterSignals.position), asc(mapClusterSignals.id)),
    ]);
    const evidenceRows =
      signals.length === 0
        ? []
        : await this.rows(sql`
            select v.signal_id,
              case when v.token_transfer_id is not null then 'token' when n.kind = 'internal' then 'internal' else 'native' end as source,
              coalesce(v.native_transfer_id, v.token_transfer_id) as transfer_id,
              coalesce(n.tx_hash, t.tx_hash) as tx_hash,
              coalesce(n.block_number, t.block_number) as block_number
            from map_cluster_signal_evidence v
            left join native_transfers n on n.id = v.native_transfer_id
            left join token_transfers t on t.id = v.token_transfer_id
            where v.signal_id in (${idList(signals.map((signal) => signal.id))})
            order by block_number, v.id`);
    const evidence = evidenceRows.map((row) => ({
      signalId: Number(row.signal_id),
      source: (row.source === 'token' ? 'token' : row.source === 'internal' ? 'internal' : 'native') as 'native' | 'internal' | 'token',
      transferId: Number(row.transfer_id),
      txHash: String(row.tx_hash),
      blockNumber: Number(row.block_number),
    }));
    return clusters.map((cluster) => ({
      ...cluster,
      nodeIds: members.filter((member) => member.clusterId === cluster.id).map((member) => member.nodeId),
      signals: signals
        .filter((signal) => signal.clusterId === cluster.id)
        .map((signal) => ({ ...signal, evidence: evidence.filter((item) => item.signalId === signal.id) })),
    }));
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

  /** Holder teratas pada snapshot, urut peringkat. */
  async findHolders(snapshotId: number, limit: number) {
    return this.db
      .select({ addressId: holders.addressId, sharePct: holders.sharePct })
      .from(holders)
      .where(eq(holders.snapshotId, snapshotId))
      .orderBy(asc(holders.rank))
      .limit(limit);
  }

  /** Query tambahan pengelompokan untuk satu token sampai blok peta. */
  clusterLoader(chainId: string, tokenId: number, blockNumber: number): ClusterLoader {
    return {
      firstReceipts: async (addressIds) => {
        if (addressIds.length === 0) return [];
        const rows = await this.rows(sql`
          select distinct on (t.to_address_id) t.id, t.from_address_id, t.to_address_id, t.block_number, t.block_timestamp
          from token_transfers t
          where t.chain_id = ${chainId} and t.token_id = ${tokenId} and t.block_number <= ${blockNumber}
            and t.to_address_id in (${idList(addressIds)})
          order by t.to_address_id, t.block_number, t.log_index, t.id`);
        return rows.map((row) => toEvidence(row, 'token'));
      },
      transfersBetween: async (fromIds, toIds) => {
        if (fromIds.length === 0 || toIds.length === 0) return [];
        const from = idList(fromIds);
        const to = idList(toIds);
        const rows = await this.rows(sql`
          select * from (
            select 'native' as source, n.id, n.from_address_id, n.to_address_id, n.block_number, n.block_timestamp
            from native_transfers n
            where n.chain_id = ${chainId} and n.block_number <= ${blockNumber}
              and n.from_address_id in (${from}) and n.to_address_id in (${to}) and n.from_address_id <> n.to_address_id
            union all
            select 'token', t.id, t.from_address_id, t.to_address_id, t.block_number, t.block_timestamp
            from token_transfers t
            where t.chain_id = ${chainId} and t.token_id = ${tokenId} and t.block_number <= ${blockNumber}
              and t.from_address_id in (${from}) and t.to_address_id in (${to}) and t.from_address_id <> t.to_address_id
          ) moves
          order by block_number, source, id
          limit ${CLUSTER_EVIDENCE_LIMIT}`);
        return rows.map((row) => toEvidence(row, row.source === 'token' ? 'token' : 'native'));
      },
    };
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

  /** Status kontrak, hub, dan address nol untuk sekumpulan address. */
  async profiles(addressIds: number[]): Promise<Map<number, AddressProfile>> {
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
