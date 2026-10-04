import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { DataStatus } from '../database/schema/enums.js';
import { toChainInfo } from '../flows/flow-summary.mapper.js';
import { HUB_LABEL_TYPES } from '../flows/flows.repository.js';
import { SnapshotFreshness } from '../tokens/snapshot-freshness.js';
import { effectiveStatus } from '../tokens/token-summary.mapper.js';
import { resolveMapToken } from './map-lookup.js';
import { CoordinationService } from './coordination.service.js';
import { EntityLabelService } from './entity-label.service.js';
import { edgeMatches, labelCounts, NO_FILTER, nodeMatches, type MapFilter } from './map-filter.js';
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
  /** Filter label, waktu, dan jenis garis. */
  filter?: MapFilter;
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
    private readonly entityLabels: EntityLabelService,
    private readonly coordination: CoordinationService,
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
    const filter = query.filter ?? NO_FILTER;
    // Garis disaring waktu/jenis dulu, supaya wallet yang tak lagi terhubung ikut keluar dari radius.
    const { nodes: inRadius, edges: radiusEdges } = trimToRadius(
      storedNodes,
      storedEdges.filter((edge) => edgeMatches(edge, filter)),
      radius,
    );
    const grouping = await this.clusters.forMap(map, storedNodes);
    const coordination = await this.coordination.forMap(map, chain, storedNodes);
    const labelsById = await this.entityLabels.labelsFor(map, inRadius, grouping);
    const counts = labelCounts(inRadius.map((node) => ({ labels: labelsById.get(node.id) ?? [] })));
    const nodes = inRadius.filter((node) => nodeMatches(labelsById.get(node.id) ?? [], filter));
    const shown = new Set(nodes.map((node) => node.id));
    const edges = radiusEdges.filter((edge) => shown.has(edge.fromNodeId) && shown.has(edge.toNodeId));
    const [tokensById, sources] = await Promise.all([
      this.repository.tokensByIds(tokenIdsOf(edges)),
      snapshot ? this.repository.snapshotSources(snapshot.id) : [],
    ]);

    const nodeViews: WalletMapNodeView[] = nodes.map((node) => ({
      ...toPartyView(node, labelsById.get(node.id) ?? []),
      distance: node.distance,
      clusterId: grouping.clusterOfNode.get(node.id) ?? null,
    }));
    const addressOf = new Map(nodes.map((node) => [node.id, node.address]));
    const edgeViews: WalletMapEdgeView[] = edges.map((edge) => toEdgeView(edge, chain, addressOf, tokensById));
    const hiddenNodes = inRadius.length - nodes.length;
    const hiddenEdges = radiusEdges.length - edges.length;

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
    if (filter.from || filter.to) {
      caveats.push('Hanya garis dengan transfer di rentang waktu yang dipilih yang ditampilkan; wallet yang terhubung di luar rentang itu ikut tersembunyi.');
    }
    if (hiddenNodes > 0) caveats.push(`${hiddenNodes} wallet disembunyikan filter label, beserta ${hiddenEdges} garisnya.`);
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
      coordination: coordination.events,
      coordinationAnalysis: coordination.analysis,
      labelCounts: counts,
      filter: {
        hide: [...filter.hide].sort(),
        labelSource: filter.labelSource,
        from: filter.from?.toISOString() ?? null,
        to: filter.to?.toISOString() ?? null,
        kinds: filter.kinds && filter.kinds.size > 0 ? [...filter.kinds].sort() : null,
        hiddenNodes,
        hiddenEdges,
      },
      caveats,
      snapshot: snapshot ? { id: snapshot.id, fetchedAt: snapshot.fetchedAt.toISOString(), blockNumber: snapshot.blockNumber, sources } : null,
      dataStatus,
    };
  }
}
