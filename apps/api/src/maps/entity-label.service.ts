import { Injectable } from '@nestjs/common';
import { numericToNumber } from '../common/units.js';
import type { walletMaps } from '../database/schema/index.js';
import type { FlowLabelView } from '../flows/flow-summary.types.js';
import { sortLabels, toLabelView } from '../tokens/holders.mapper.js';
import { labelsForSubject } from './entity-labels.js';
import { MapsRepository } from './maps.repository.js';
import type { MapClusters } from './wallet-cluster.service.js';

type MapRow = typeof walletMaps.$inferSelect;
type NodeRow = Awaited<ReturnType<MapsRepository['mapNodes']>>[number];

/** Label tiap wallet peta: label tersimpan ditambah label dugaan dari data peta. */
@Injectable()
export class EntityLabelService {
  constructor(private readonly repository: MapsRepository) {}

  async labelsFor(map: MapRow, nodes: readonly NodeRow[], grouping: Pick<MapClusters, 'clusters' | 'clusterOfNode'>): Promise<Map<number, FlowLabelView[]>> {
    const [stored, token] = await Promise.all([
      this.repository.labelsByAddressIds(nodes.map((node) => node.addressId)),
      this.repository.findTokenById(map.tokenId),
    ]);
    const bundled = new Set(grouping.clusters.filter((cluster) => cluster.labels.includes('bundled_or_sniper_activity')).map((cluster) => cluster.id));
    const bundledNodeIds = new Set(nodes.filter((node) => bundled.has(grouping.clusterOfNode.get(node.id) ?? '')).map((node) => node.id));
    const context = { deployerAddressId: token?.deployerAddressId ?? null, bundledNodeIds };
    return new Map(
      nodes.map((node) => [
        node.id,
        labelsForSubject(
          {
            nodeId: node.id,
            addressId: node.addressId,
            address: node.address,
            role: node.role,
            sharePct: numericToNumber(node.sharePct) ?? 0,
            isContract: node.isContract,
            stored: sortLabels(stored.get(node.addressId) ?? []).map(toLabelView),
          },
          context,
        ),
      ]),
    );
  }
}
