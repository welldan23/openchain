import { Injectable, NotFoundException } from '@nestjs/common';
import { numericToNumber } from '../common/units.js';
import type { CoordinationKind } from '../database/schema/enums.js';
import { toChainInfo, toMovementType, movementKey } from '../flows/flow-summary.mapper.js';
import { FlowsRepository } from '../flows/flows.repository.js';
import { sortLabels, toLabelView } from '../tokens/holders.mapper.js';
import { coordinationCaveats, CoordinationService } from './coordination.service.js';
import { EntityLabelService } from './entity-label.service.js';
import { resolveMapToken } from './map-lookup.js';
import { MapsRepository } from './maps.repository.js';
import type { CoordinationFindingResponse, CoordinationPartyView } from './maps.types.js';
import { WalletClusterService } from './wallet-cluster.service.js';

/** Hal yang paling mungkin membuat tiap jenis temuan keliru. */
const KIND_CAVEAT: Record<CoordinationKind, string> = {
  funding_burst: 'Pendana yang mengirim ke banyak wallet sekaligus bisa juga layanan tanpa label, misalnya faucet, bridge, atau pembayaran massal.',
  similar_amount: 'Jumlah yang sama bisa berasal dari nominal umum (mis. 0,1 ETH) yang dipakai banyak orang tanpa saling kenal.',
  same_block_buy: 'Pembelian di blok yang sama bisa dari bundler, tapi juga dari bot publik atau banyak pembeli sekaligus saat peluncuran.',
  coordinated_sell: 'Penjualan berdekatan bisa juga reaksi pasar bersama, misalnya setelah harga bergerak tajam.',
};

/**
 * Detail satu temuan koordinasi: kejadiannya, semua pihak di transaksi
 * pendukung beserta labelnya, blok yang dipakai, jenis tiap perpindahan, dan
 * kelompok wallet yang terkait. Hanya dari data tersimpan.
 */
@Injectable()
export class CoordinationFindingService {
  constructor(
    private readonly repository: MapsRepository,
    private readonly flows: FlowsRepository,
    private readonly coordination: CoordinationService,
    private readonly clusters: WalletClusterService,
    private readonly entityLabels: EntityLabelService,
  ) {}

  async getFinding(chainId: string, rawToken: string, findingId: string, mapId?: number): Promise<CoordinationFindingResponse> {
    const { chain, token } = await resolveMapToken(this.repository, chainId, rawToken);
    const map = mapId === undefined ? await this.repository.findLatestMapWithEvent(token.id, findingId) : await this.repository.findMap(mapId);
    if (!map || map.tokenId !== token.id) {
      throw new NotFoundException(
        mapId === undefined ? `Temuan ${findingId} tidak ada di peta mana pun untuk token ini.` : `Peta #${mapId} tidak ditemukan untuk token ini.`,
      );
    }
    const nodes = await this.repository.mapNodes(map.id);
    const { analysis, events, stored } = await this.coordination.forMap(map, chain, nodes);
    const index = stored.findIndex((item) => item.key === findingId);
    if (index < 0) throw new NotFoundException(`Temuan ${findingId} tidak ada di peta #${map.id}.`);
    const event = events[index];
    const raw = stored[index];

    const grouping = await this.clusters.forMap(map, nodes);
    const nodeLabels = await this.entityLabels.labelsFor(map, nodes, grouping);
    const nodeByAddressId = new Map(nodes.map((node) => [node.addressId, node]));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const memberIds = new Set(raw.nodeIds);
    const partyIds = [
      ...new Set([
        ...raw.nodeIds.flatMap((id) => (nodeById.has(id) ? [nodeById.get(id)!.addressId] : [])),
        ...raw.txs.flatMap((tx) => [tx.fromAddressId, tx.toAddressId]),
      ]),
    ];
    const outside = partyIds.filter((id) => !nodeByAddressId.has(id));
    const [outsideLabels, outsideProfiles, outsideAddresses, movementTypes] = await Promise.all([
      this.repository.labelsByAddressIds(outside),
      this.repository.profiles(outside),
      this.flows.addressesByIds(outside),
      this.flows.movementTypesFor(raw.txs.map((tx) => ({ source: tx.source, id: tx.transferId }))),
    ]);

    const parties: CoordinationPartyView[] = partyIds.map((addressId) => {
      const node = nodeByAddressId.get(addressId);
      if (node) {
        return {
          address: node.address,
          role: node.role,
          sharePct: numericToNumber(node.sharePct) ?? 0,
          isContract: node.isContract,
          labels: nodeLabels.get(node.id) ?? [],
          member: memberIds.has(node.id),
          clusterId: grouping.clusterOfNode.get(node.id) ?? null,
        };
      }
      return {
        address: outsideAddresses.get(addressId) ?? '',
        role: null,
        sharePct: null,
        isContract: outsideProfiles.get(addressId)?.isContract ?? null,
        labels: sortLabels(outsideLabels.get(addressId) ?? []).map(toLabelView),
        member: false,
        clusterId: null,
      };
    });

    const blockCounts = new Map<number, number>();
    for (const tx of event.transactions) blockCounts.set(tx.blockNumber, (blockCounts.get(tx.blockNumber) ?? 0) + 1);
    const blocks = [...blockCounts].map(([blockNumber, transactionCount]) => ({ blockNumber, transactionCount })).sort((a, b) => a.blockNumber - b.blockNumber);

    const relatedClusters = grouping.clusters.flatMap((cluster) => {
      const membersInFinding = raw.nodeIds.filter((id) => grouping.clusterOfNode.get(id) === cluster.id).length;
      return membersInFinding > 0
        ? [{ id: cluster.id, name: cluster.name, labels: cluster.labels, confidence: cluster.confidence, membersInFinding }]
        : [];
    });

    return {
      chain: toChainInfo(chain),
      token: { address: token.address, symbol: token.symbol },
      map: { id: map.id, builtAt: map.builtAt.toISOString(), status: map.status },
      analysis,
      finding: {
        ...event,
        transactions: event.transactions.map((tx, position) => {
          const source = raw.txs[position];
          return { ...tx, movement: toMovementType(movementTypes.get(movementKey(source.source, source.transferId))) };
        }),
      },
      parties,
      blocks,
      sameBlockTransactions: blocks.filter((block) => block.transactionCount > 1).reduce((sum, block) => sum + block.transactionCount, 0),
      relatedClusters,
      caveats: [KIND_CAVEAT[event.kind], ...coordinationCaveats(1, map.status)],
    };
  }
}
