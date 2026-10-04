import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { toChainInfo, toMovementType, movementKey } from '../flows/flow-summary.mapper.js';
import { FlowsRepository, HUB_LABEL_TYPES } from '../flows/flows.repository.js';
import { TransactionEvidenceService } from '../flows/transaction-evidence.service.js';
import { EntityLabelService } from './entity-label.service.js';
import { resolveMapToken } from './map-lookup.js';
import { tokenIdsOf, toEdgeView, toPartyView } from './maps.mapper.js';
import { MapsRepository, type TransferRef } from './maps.repository.js';
import type { WalletMapEdgeDetailResponse } from './maps.types.js';
import { WalletClusterService } from './wallet-cluster.service.js';

const EDGE_ID = /^(native|token):(\d+)$/;

/** Id garis seperti di respons peta: `native:<id>` atau `token:<id>`. */
export function parseEdgeId(value: string): TransferRef {
  const match = EDGE_ID.exec(value);
  const id = match ? Number(match[2]) : NaN;
  if (!match || !Number.isSafeInteger(id) || id === 0) {
    throw new BadRequestException('Id garis harus berbentuk native:<angka> atau token:<angka>, seperti di respons peta.');
  }
  return { table: match[1] === 'token' ? 'token' : 'native', id };
}

/**
 * Detail satu garis Peta Hubungan Wallet: dua wallet di ujungnya, jenis
 * perpindahannya, garis lain di antara keduanya, dan bukti transaksi lengkap.
 * Hanya dari data tersimpan.
 */
@Injectable()
export class WalletMapEdgeService {
  constructor(
    private readonly repository: MapsRepository,
    private readonly flows: FlowsRepository,
    private readonly transactions: TransactionEvidenceService,
    private readonly clusters: WalletClusterService,
    private readonly entityLabels: EntityLabelService,
  ) {}

  async getEdge(chainId: string, rawToken: string, rawEdgeId: string, mapId?: number): Promise<WalletMapEdgeDetailResponse> {
    const ref = parseEdgeId(rawEdgeId);
    const { chain, token } = await resolveMapToken(this.repository, chainId, rawToken);
    const map = mapId === undefined ? await this.repository.findLatestMapWithEdge(token.id, ref) : await this.repository.findMap(mapId);
    if (!map || map.tokenId !== token.id) {
      throw new NotFoundException(
        mapId === undefined ? `Garis ${rawEdgeId} tidak ada di peta mana pun untuk token ini.` : `Peta #${mapId} tidak ditemukan untuk token ini.`,
      );
    }
    const edge = await this.repository.findMapEdge(map.id, ref);
    if (!edge) throw new NotFoundException(`Garis ${rawEdgeId} tidak ada di peta #${map.id}.`);

    const [nodes, related, movementTypes] = await Promise.all([
      this.repository.mapNodes(map.id, [edge.fromNodeId, edge.toNodeId]),
      this.repository.edgesBetween(map.id, edge.fromNodeId, edge.toNodeId),
      this.flows.movementTypesFor([{ source: edge.source, id: edge.transferId }]),
    ]);
    const grouping = await this.clusters.forMap(map);
    const [labelsById, tokensById, transaction] = await Promise.all([
      this.entityLabels.labelsFor(map, nodes, grouping),
      this.repository.tokensByIds(tokenIdsOf(related)),
      this.transactions.getEvidence(chain.id, edge.txHash),
    ]);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const party = (nodeId: number) => {
      const node = nodeById.get(nodeId);
      if (!node) throw new Error(`Node #${nodeId} tidak ada di peta #${map.id}`);
      return toPartyView(node, labelsById.get(node.id) ?? []);
    };
    const from = party(edge.fromNodeId);
    const to = party(edge.toNodeId);
    const addressOf = new Map(nodes.map((node) => [node.id, node.address]));
    const view = (row: typeof edge) => toEdgeView(row, chain, addressOf, tokensById);

    const caveats = ['Garis ini adalah satu transfer on-chain. Transfer di antara dua wallet tidak membuktikan keduanya dimiliki orang yang sama.'];
    const hubTypes = new Set<string>(HUB_LABEL_TYPES);
    const mixed = [from, to].filter((item) => item.isContract === true || item.labels.some((label) => hubTypes.has(label.type)));
    if (mixed.length > 0) {
      caveats.push(
        `${mixed.map((item) => item.labels[0]?.name ?? item.address).join(' dan ')} adalah exchange, pool, atau kontrak; dana di sana tercampur dengan dana lain.`,
      );
    }

    return {
      chain: toChainInfo(chain),
      token: { address: token.address, symbol: token.symbol },
      map: { id: map.id, builtAt: map.builtAt.toISOString(), status: map.status },
      edge: { ...view(edge), movement: toMovementType(movementTypes.get(movementKey(edge.source, edge.transferId))) },
      from,
      to,
      relatedEdges: related.filter((row) => row.edgeId !== edge.edgeId).map(view),
      transaction,
      caveats,
    };
  }
}
