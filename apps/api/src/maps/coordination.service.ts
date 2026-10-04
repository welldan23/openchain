/**
 * Mendeteksi kejadian koordinasi sebuah peta sekali, menyimpannya, lalu
 * menyajikannya. Hanya dari garis peta dan transfer token tersimpan sampai blok
 * peta; tidak ada provider yang dihubungi.
 */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { formatUnits, numericToNumber } from '../common/units.js';
import { DATABASE, type Database } from '../database/database.module.js';
import type { DataStatus } from '../database/schema/enums.js';
import { coordinationEventMembers, coordinationEvents, coordinationTxs, walletMaps } from '../database/schema/index.js';
import { movementKey, nativeAssetOf, toChainInfo } from '../flows/flow-summary.mapper.js';
import type { FlowAsset } from '../flows/flow-summary.types.js';
import { COORDINATION_HEURISTIC, detectCoordination, type DetectedEvent, type FundingMove, type HolderMove } from './coordination-detection.js';
import { resolveMapToken } from './map-lookup.js';
import { MapsRepository } from './maps.repository.js';
import type { ClusteringInfo, CoordinationEventView, WalletMapCoordinationResponse } from './maps.types.js';

type MapRow = typeof walletMaps.$inferSelect;
type ChainRow = NonNullable<Awaited<ReturnType<MapsRepository['findChain']>>>;
type NodeRow = Awaited<ReturnType<MapsRepository['mapNodes']>>[number];

/** Lawan transaksi yang menandai jual-beli di pasar. */
const VENUE_LABELS = new Set(['liquidity_pool', 'router']);

export function coordinationCaveats(eventCount: number, mapStatus: DataStatus): string[] {
  const caveats = [
    'Gerak serempak adalah dugaan: bisa juga kebetulan saat token sedang ramai, atau layanan (bot publik, faucet) yang dipakai banyak orang.',
    'Beli dan jual hanya dikenali bila lawan transaksinya diketahui sebagai pool, router, atau kontrak.',
  ];
  if (eventCount === 0) caveats.push('Tidak ada gerak serempak yang terdeteksi pada data peta ini. Ini bukan bukti tidak ada koordinasi.');
  if (mapStatus !== 'complete') caveats.push('Data peta belum lengkap, jadi kejadian koordinasi bisa terlewat.');
  return caveats;
}

export interface MapCoordination {
  analysis: ClusteringInfo;
  events: CoordinationEventView[];
  /** Baris tersimpan, urutannya sama dengan `events`. */
  stored: Awaited<ReturnType<MapsRepository['storedCoordination']>>;
}

@Injectable()
export class CoordinationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: MapsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** `GET /api/maps/:chain/:token/coordination`: peta tertentu, atau peta terbaru token ini. */
  async getCoordination(chainId: string, rawToken: string, mapId?: number): Promise<WalletMapCoordinationResponse> {
    const { chain, token } = await resolveMapToken(this.repository, chainId, rawToken);
    const map = mapId === undefined ? await this.repository.findLatestMap(token.id) : await this.repository.findMap(mapId);
    if (!map || map.tokenId !== token.id) {
      throw new NotFoundException(
        mapId === undefined
          ? 'Belum ada peta untuk token ini; buka GET /api/maps/:chain/:token dulu untuk membentuknya.'
          : `Peta #${mapId} tidak ditemukan untuk token ini.`,
      );
    }
    const { analysis, events } = await this.forMap(map, chain);
    return {
      chain: toChainInfo(chain),
      token: { address: token.address, symbol: token.symbol },
      map: { id: map.id, builtAt: map.builtAt.toISOString(), status: map.status },
      analysis,
      coordination: events,
      caveats: coordinationCaveats(events.length, map.status),
    };
  }

  /** Kejadian koordinasi peta; dideteksi dan disimpan dulu bila belum pernah. */
  async forMap(map: MapRow, chain: ChainRow, nodes?: NodeRow[]): Promise<MapCoordination> {
    const allNodes = nodes ?? (await this.repository.mapNodes(map.id));
    const done =
      map.coordinatedAt && map.coordinationHeuristic
        ? { at: map.coordinatedAt, heuristic: map.coordinationHeuristic }
        : await this.compute(map, allNodes);
    const stored = await this.repository.storedCoordination(map.id);
    const addressOfNode = new Map(allNodes.map((node) => [node.id, node.address]));
    const tokensById = await this.repository.tokensByIds([...new Set(stored.flatMap((item) => item.txs.flatMap((tx) => (tx.tokenId === null ? [] : [tx.tokenId]))))]);
    const nativeAsset = nativeAssetOf(chain);
    const events = stored.map(
      (item): CoordinationEventView => ({
        id: item.key,
        kind: item.kind,
        detail: item.detail,
        members: item.nodeIds.flatMap((id) => (addressOfNode.has(id) ? [addressOfNode.get(id)!] : [])),
        confidence: item.confidence,
        classification: 'heuristic',
        heuristic: item.heuristicName,
        timestamp: item.startedAt.toISOString(),
        windowSeconds: item.windowSeconds,
        blockNumber: item.blockNumber,
        transactions: item.txs.map((tx) => {
          const meta = tx.tokenId === null ? null : tokensById.get(tx.tokenId);
          const asset: FlowAsset = meta
            ? { type: 'token', address: meta.address, symbol: meta.symbol, name: meta.name, decimals: meta.decimals }
            : nativeAsset;
          return {
            id: movementKey(tx.source, tx.transferId),
            action: tx.action,
            txHash: tx.txHash,
            blockNumber: tx.blockNumber,
            timestamp: tx.timestamp.toISOString(),
            from: tx.from,
            to: tx.to,
            transferKind: tx.source,
            asset,
            amountRaw: tx.amountRaw,
            amount: asset.decimals === null ? null : formatUnits(tx.amountRaw, asset.decimals),
            amountUsd: numericToNumber(tx.amountUsd),
            classification: 'verified_fact',
          };
        }),
      }),
    );
    return { analysis: { heuristic: done.heuristic, computedAt: done.at.toISOString() }, events, stored };
  }

  private async compute(map: MapRow, nodes: NodeRow[]): Promise<{ at: Date; heuristic: string }> {
    const edges = await this.repository.mapEdges(map.id);
    const profiles = await this.repository.profiles(nodes.map((node) => node.addressId));
    const blocked = (node: NodeRow) => {
      const profile = profiles.get(node.addressId);
      return profile?.hub === true || profile?.burn === true || (node.isContract ?? profile?.isContract) === true;
    };
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const traders = nodes.filter((node) => node.role === 'holder' && !blocked(node));
    const traderByAddress = new Map(traders.map((node) => [node.addressId, node]));
    const traderIds = new Set(traders.map((node) => node.id));

    const fundings: FundingMove[] = edges
      .filter((edge) => edge.kind === 'funding' && traderIds.has(edge.toNodeId) && !blocked(nodeById.get(edge.fromNodeId)!))
      .map((edge) => ({
        funderNodeId: edge.fromNodeId,
        holderNodeId: edge.toNodeId,
        ref: { table: 'native', id: edge.transferId },
        blockNumber: edge.blockNumber,
        timestamp: edge.timestamp,
        amountRaw: edge.amountRaw,
      }));

    const trades = await this.repository.holderTokenTransfers(map.chainId, map.tokenId, map.blockNumber, [...traderByAddress.keys()]);
    const counterparties = [
      ...new Set(trades.flatMap((trade) => [trade.fromAddressId, trade.toAddressId]).filter((id) => !traderByAddress.has(id))),
    ];
    const [counterpartyProfiles, counterpartyLabels] = await Promise.all([
      this.repository.profiles(counterparties),
      this.repository.labelsByAddressIds(counterparties),
    ]);
    const isVenue = (addressId: number) =>
      counterpartyProfiles.get(addressId)?.isContract === true ||
      (counterpartyLabels.get(addressId) ?? []).some((label) => VENUE_LABELS.has(label.labelType));
    const buys: HolderMove[] = [];
    const sells: HolderMove[] = [];
    for (const trade of trades) {
      const move = { ref: { table: trade.table, id: trade.id }, blockNumber: trade.blockNumber, timestamp: trade.timestamp };
      const buyer = traderByAddress.get(trade.toAddressId);
      const seller = traderByAddress.get(trade.fromAddressId);
      if (buyer && !seller && isVenue(trade.fromAddressId)) buys.push({ ...move, holderNodeId: buyer.id });
      if (seller && !buyer && isVenue(trade.toAddressId)) sells.push({ ...move, holderNodeId: seller.id });
    }

    const detected = detectCoordination({ fundings, buys, sells, addressOf: (id) => nodeById.get(id)?.address ?? '' });
    const at = this.clock.now();
    return this.db.transaction(async (tx) => {
      // Kunci baris peta supaya dua permintaan bersamaan tidak menyimpan dua kali.
      const locked = (await tx.execute(
        sql`select coordinated_at, coordination_heuristic from wallet_maps where id = ${map.id} for update`,
      )) as unknown as { rows: Array<{ coordinated_at: string | Date | null; coordination_heuristic: string | null }> };
      const current = locked.rows[0];
      if (current?.coordinated_at && current.coordination_heuristic) {
        return { at: new Date(current.coordinated_at), heuristic: current.coordination_heuristic };
      }
      for (const item of detected) await this.store(tx as unknown as Database, map.id, item);
      await tx.update(walletMaps).set({ coordinatedAt: at, coordinationHeuristic: COORDINATION_HEURISTIC }).where(eq(walletMaps.id, map.id));
      return { at, heuristic: COORDINATION_HEURISTIC };
    });
  }

  private async store(db: Database, mapId: number, item: DetectedEvent): Promise<void> {
    const [row] = await db
      .insert(coordinationEvents)
      .values({
        mapId,
        key: item.key,
        kind: item.kind,
        detail: item.detail,
        confidence: item.confidence,
        heuristicName: COORDINATION_HEURISTIC,
        startedAt: item.startedAt,
        windowSeconds: item.windowSeconds,
        blockNumber: item.blockNumber,
      })
      .returning({ id: coordinationEvents.id });
    await db.insert(coordinationEventMembers).values(item.memberNodeIds.map((nodeId) => ({ mapId, eventId: row.id, nodeId })));
    // Satu transfer cukup dicatat sekali per kejadian.
    const unique = new Map(item.txs.map((tx) => [`${tx.ref.table}:${tx.ref.id}`, tx]));
    await db.insert(coordinationTxs).values(
      [...unique.values()].map((tx) => ({
        eventId: row.id,
        action: tx.action,
        nativeTransferId: tx.ref.table === 'native' ? tx.ref.id : null,
        tokenTransferId: tx.ref.table === 'token' ? tx.ref.id : null,
      })),
    );
  }
}
