import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { DataStatus } from '../database/schema/enums.js';
import { toChainInfo } from '../flows/flow-summary.mapper.js';
import { HUB_LABEL_TYPES } from '../flows/flows.repository.js';
import { SnapshotFreshness } from '../tokens/snapshot-freshness.js';
import { effectiveStatus } from '../tokens/token-summary.mapper.js';
import { resolveMapToken } from './map-lookup.js';
import { trimToRadius } from './map-radius.js';
import { tokenIdsOf, toEdgeView, toPartyView } from './maps.mapper.js';
import { MapsRepository } from './maps.repository.js';
import type { WalletMapEdgeView, WalletMapNodeView, WalletMapResponse } from './maps.types.js';
import { WalletClusterService } from './wallet-cluster.service.js';
import { FUNDING_DEPTH_RANGE, WALLET_MAP_DEFAULTS, WalletMapBuilder } from './wallet-map-builder.service.js';

export const DEFAULT_RADIUS = WALLET_MAP_DEFAULTS.fundingDepth;
export const MAX_RADIUS = FUNDING_DEPTH_RANGE.max;

export interface WalletMapQuery {
  /** Langkah dari holder yang ditampilkan, 0–5. */
  radius?: number;
  /** Holder teratas yang dipetakan. */
  holders?: number;
  /** Buka peta tersimpan tertentu. */
  mapId?: number;
}

/**
 * Peta Hubungan Wallet sebuah token. Peta tersimpan dipakai ulang bila
 * snapshot, jumlah holder, dan kedalamannya cocok dan belum ada pemindaian
 * baru di chain itu sesudah peta dibentuk. Selain itu peta dibentuk dari data
 * tersimpan; tidak ada provider yang dihubungi saat diminta.
 */
@Injectable()
export class WalletMapService {
  constructor(
    private readonly repository: MapsRepository,
    private readonly builder: WalletMapBuilder,
    private readonly freshness: SnapshotFreshness,
    private readonly clusters: WalletClusterService,
  ) {}

  async getMap(chainId: string, rawToken: string, query: WalletMapQuery = {}): Promise<WalletMapResponse> {
    const { chain, token } = await resolveMapToken(this.repository, chainId, rawToken);

    let map;
    let radius: number;
    let reused = true;
    if (query.mapId !== undefined) {
      map = await this.repository.findMap(query.mapId);
      if (!map || map.tokenId !== token.id) throw new NotFoundException(`Peta #${query.mapId} tidak ditemukan untuk token ini.`);
      radius = query.radius ?? Math.min(DEFAULT_RADIUS, map.fundingDepth);
      if (radius > map.fundingDepth) {
        throw new BadRequestException(`Peta #${map.id} hanya menelusuri ${map.fundingDepth} lapis pendana; radius maksimal ${map.fundingDepth}.`);
      }
    } else {
      const snapshot = await this.repository.findSnapshot(token.id);
      if (!snapshot) throw new NotFoundException('Belum ada snapshot holder untuk token ini, jadi peta belum bisa dibentuk.');
      radius = query.radius ?? DEFAULT_RADIUS;
      const holderLimit = query.holders ?? WALLET_MAP_DEFAULTS.holderLimit;
      map = await this.repository.findReusableMap(snapshot.id, holderLimit, radius);
      if (!map || (await this.repository.hasScanAfter(chain.id, map.builtAt))) {
        const built = await this.builder.build({
          chainId: chain.id,
          tokenAddress: token.address,
          holderLimit,
          // Bentuk minimal sedalam default supaya radius kecil berikutnya bisa memakai ulang.
          fundingDepth: Math.max(radius, WALLET_MAP_DEFAULTS.fundingDepth),
          snapshotBlock: snapshot.blockNumber,
        });
        map = await this.repository.findMap(built.mapId);
        if (!map) throw new Error(`Peta #${built.mapId} tidak tersimpan`);
        reused = false;
      }
    }

    const [storedNodes, storedEdges, snapshot] = await Promise.all([
      this.repository.mapNodes(map.id),
      this.repository.mapEdges(map.id),
      map.snapshotId === null ? null : this.repository.findSnapshotById(map.snapshotId),
    ]);
    const { nodes, edges } = trimToRadius(storedNodes, storedEdges, radius);
    const [labelsById, tokensById, sources, grouping] = await Promise.all([
      this.repository.labelsByAddressIds(nodes.map((node) => node.addressId)),
      this.repository.tokensByIds(tokenIdsOf(edges)),
      snapshot ? this.repository.snapshotSources(snapshot.id) : [],
      this.clusters.forMap(map, storedNodes),
    ]);

    const nodeViews: WalletMapNodeView[] = nodes.map((node) => ({
      ...toPartyView(node, labelsById.get(node.addressId) ?? []),
      distance: node.distance,
      clusterId: grouping.clusterOfNode.get(node.id) ?? null,
    }));
    const addressOf = new Map(nodes.map((node) => [node.id, node.address]));
    const edgeViews: WalletMapEdgeView[] = edges.map((edge) => toEdgeView(edge, chain, addressOf, tokensById));

    const caveats = [
      'Setiap garis adalah transfer on-chain. Wallet yang berdekatan atau didanai pihak yang sama belum tentu dimiliki orang yang sama.',
    ];
    const hubTypes = new Set<string>(HUB_LABEL_TYPES);
    if (nodeViews.some((node) => node.isContract === true || node.labels.some((label) => hubTypes.has(label.type)))) {
      caveats.push('Exchange, router, bridge, pool, kontrak, dan pengirim kiriman internal tidak ditelusuri lebih jauh karena dananya tercampur dengan dana lain.');
    }
    if (radius < map.fundingDepth) {
      caveats.push(`Hanya wallet sampai ${radius} langkah dari holder yang ditampilkan; peta ini menelusuri ${map.fundingDepth} lapis pendana.`);
    }
    if (nodeViews.length > 0 && edgeViews.length === 0) {
      caveats.push('Belum ada transfer tersimpan di antara wallet peta. Ini bukan bukti bahwa mereka tidak berhubungan.');
    }

    const dataStatus: DataStatus = snapshot
      ? effectiveStatus(map.status, snapshot.fetchedAt, this.freshness.now(), this.freshness.staleAfterMinutes)
      : map.status;
    return {
      chain: toChainInfo(chain),
      token: { address: token.address, name: token.name, symbol: token.symbol, decimals: token.decimals },
      map: {
        id: map.id,
        builtAt: map.builtAt.toISOString(),
        reused,
        holderLimit: map.holderLimit,
        fundingDepth: map.fundingDepth,
        radius,
        status: map.status,
        statusReason: map.statusReason,
        missingFields: map.missingFields,
      },
      nodes: nodeViews,
      edges: edgeViews,
      clusters: grouping.clusters,
      clustering: grouping.clustering,
      caveats,
      snapshot: snapshot ? { id: snapshot.id, fetchedAt: snapshot.fetchedAt.toISOString(), blockNumber: snapshot.blockNumber, sources } : null,
      dataStatus,
    };
  }
}
