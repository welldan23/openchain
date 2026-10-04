/**
 * Menghitung kelompok wallet sebuah peta sekali, menyimpannya, lalu
 * menyajikannya. Kelompok dihitung dari garis peta dan transfer tersimpan
 * sampai blok peta, jadi peta lama tetap memberi kelompok yang sama. Tidak ada
 * provider yang dihubungi.
 */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { numericToNumber } from '../common/units.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { mapClusterMembers, mapClusters, mapClusterSignalEvidence, mapClusterSignals, walletMaps } from '../database/schema/index.js';
import type { DataStatus } from '../database/schema/enums.js';
import { movementKey, toChainInfo } from '../flows/flow-summary.mapper.js';
import { resolveMapToken } from './map-lookup.js';
import { MapsRepository } from './maps.repository.js';
import type { ClusteringInfo, WalletClusterView, WalletMapClustersResponse } from './maps.types.js';
import { CLUSTER_HEURISTIC, clusterWallets, type ClusterNode, type WalletCluster } from './wallet-clustering.js';

type MapRow = typeof walletMaps.$inferSelect;

/** Catatan umum pengelompokan, dipakai juga respons peta. */
export function clusterCaveats(clusterCount: number, mapStatus: DataStatus): string[] {
  const caveats = ['Kelompok adalah dugaan dari pola transaksi, bukan bukti bahwa wallet dimiliki orang yang sama.'];
  if (clusterCount === 0) caveats.push('Tidak ada kelompok yang terbentuk dari data peta ini. Ini bukan bukti bahwa holder tidak saling terkait.');
  if (mapStatus !== 'complete') caveats.push('Data peta belum lengkap, jadi kelompok bisa belum terlihat.');
  return caveats;
}
type NodeRow = Awaited<ReturnType<MapsRepository['mapNodes']>>[number];

export interface MapClusters {
  clustering: ClusteringInfo;
  clusters: WalletClusterView[];
  /** Id kelompok tiap node anggota. */
  clusterOfNode: Map<number, string>;
}

@Injectable()
export class WalletClusterService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: MapsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** `GET /api/maps/:chain/:token/clusters`: peta tertentu, atau peta terbaru token ini. */
  async getClusters(chainId: string, rawToken: string, mapId?: number): Promise<WalletMapClustersResponse> {
    const { chain, token } = await resolveMapToken(this.repository, chainId, rawToken);
    const map = mapId === undefined ? await this.repository.findLatestMap(token.id) : await this.repository.findMap(mapId);
    if (!map || map.tokenId !== token.id) {
      throw new NotFoundException(
        mapId === undefined
          ? 'Belum ada peta untuk token ini; buka GET /api/maps/:chain/:token dulu untuk membentuknya.'
          : `Peta #${mapId} tidak ditemukan untuk token ini.`,
      );
    }
    const nodes = await this.repository.mapNodes(map.id);
    const { clustering, clusters, clusterOfNode } = await this.forMap(map, nodes);
    const holders = nodes.filter((node) => node.role === 'holder');
    return {
      chain: toChainInfo(chain),
      token: { address: token.address, symbol: token.symbol },
      map: { id: map.id, builtAt: map.builtAt.toISOString(), status: map.status },
      clustering,
      clusters,
      unclusteredHolders: holders.filter((node) => !clusterOfNode.has(node.id)).length,
      caveats: clusterCaveats(clusters.length, map.status),
    };
  }

  /** Kelompok peta; dihitung dan disimpan dulu bila belum pernah. */
  async forMap(map: MapRow, nodes?: NodeRow[]): Promise<MapClusters> {
    const allNodes = nodes ?? (await this.repository.mapNodes(map.id));
    const clustered = map.clusteredAt && map.clusterHeuristic ? { at: map.clusteredAt, heuristic: map.clusterHeuristic } : await this.compute(map, allNodes);
    const stored = await this.repository.storedClusters(map.id);
    const nodeById = new Map(allNodes.map((node) => [node.id, node]));
    const clusterOfNode = new Map<number, string>();
    const clusters = stored.map((cluster): WalletClusterView => {
      const members = cluster.nodeIds.flatMap((id) => (nodeById.has(id) ? [nodeById.get(id)!] : []));
      for (const member of members) clusterOfNode.set(member.id, cluster.key);
      const holders = members.filter((member) => member.role === 'holder');
      return {
        id: cluster.key,
        name: cluster.name,
        reason: cluster.reason,
        labels: cluster.labels,
        confidence: cluster.confidence,
        classification: 'heuristic',
        heuristic: cluster.heuristicName,
        hasDirectEvidence: cluster.hasDirectEvidence,
        members: members.map((member) => member.address),
        holderCount: holders.length,
        sharePct: Math.round(holders.reduce((sum, member) => sum + (numericToNumber(member.sharePct) ?? 0), 0) * 1e6) / 1e6,
        signals: cluster.signals.map((signal) => ({
          id: signal.key,
          label: signal.label,
          detail: signal.detail,
          matched: signal.matched,
          evidence: signal.evidence.map((item) => ({
            id: movementKey(item.source, item.transferId),
            transferKind: item.source,
            txHash: item.txHash,
            blockNumber: item.blockNumber,
          })),
        })),
        caveats: cluster.caveats,
      };
    });
    return { clustering: { heuristic: clustered.heuristic, computedAt: clustered.at.toISOString() }, clusters, clusterOfNode };
  }

  private async compute(map: MapRow, nodes: NodeRow[]): Promise<{ at: Date; heuristic: string }> {
    const [edges, token] = await Promise.all([this.repository.mapEdges(map.id), this.repository.findTokenById(map.tokenId)]);
    const profiles = await this.repository.profiles(nodes.map((node) => node.addressId));
    const clusterNodes: ClusterNode[] = nodes.map((node) => ({
      id: node.id,
      addressId: node.addressId,
      address: node.address,
      role: node.role,
      sharePct: numericToNumber(node.sharePct) ?? 0,
      isContract: node.isContract ?? profiles.get(node.addressId)?.isContract ?? null,
      hub: profiles.get(node.addressId)?.hub ?? false,
    }));
    const clusters = await clusterWallets(
      { nodes: clusterNodes, edges, deployerAddressId: token?.deployerAddressId ?? null, mapComplete: map.status === 'complete' },
      this.repository.clusterLoader(map.chainId, map.tokenId, map.blockNumber),
    );
    const at = this.clock.now();

    return this.db.transaction(async (tx) => {
      // Kunci baris peta supaya dua permintaan bersamaan tidak menyimpan kelompok dua kali.
      const locked = (await tx.execute(sql`select clustered_at, cluster_heuristic from wallet_maps where id = ${map.id} for update`)) as unknown as {
        rows: Array<{ clustered_at: string | Date | null; cluster_heuristic: string | null }>;
      };
      const current = locked.rows[0];
      if (current?.clustered_at && current.cluster_heuristic) return { at: new Date(current.clustered_at), heuristic: current.cluster_heuristic };
      for (const cluster of clusters) await this.store(tx as unknown as Database, map.id, cluster);
      await tx.update(walletMaps).set({ clusteredAt: at, clusterHeuristic: CLUSTER_HEURISTIC }).where(eq(walletMaps.id, map.id));
      return { at, heuristic: CLUSTER_HEURISTIC };
    });
  }

  private async store(db: Database, mapId: number, cluster: WalletCluster): Promise<void> {
    const [row] = await db
      .insert(mapClusters)
      .values({
        mapId,
        key: cluster.key,
        name: cluster.name,
        reason: cluster.reason,
        labels: cluster.labels,
        confidence: cluster.confidence,
        caveats: cluster.caveats,
        heuristicName: CLUSTER_HEURISTIC,
        hasDirectEvidence: cluster.hasDirectEvidence,
      })
      .returning({ id: mapClusters.id });
    await db.insert(mapClusterMembers).values(cluster.memberNodeIds.map((nodeId) => ({ mapId, clusterId: row.id, nodeId })));
    for (const [position, signal] of cluster.signals.entries()) {
      const [stored] = await db
        .insert(mapClusterSignals)
        .values({ clusterId: row.id, key: signal.key, label: signal.label, detail: signal.detail, matched: signal.matched, position })
        .returning({ id: mapClusterSignals.id });
      if (signal.evidence.length === 0) continue;
      await db.insert(mapClusterSignalEvidence).values(
        signal.evidence.map((ref) => ({
          signalId: stored.id,
          nativeTransferId: ref.table === 'native' ? ref.id : null,
          tokenTransferId: ref.table === 'token' ? ref.id : null,
        })),
      );
    }
  }
}
