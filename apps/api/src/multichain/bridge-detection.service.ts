/**
 * Deteksi jembatan dan router untuk satu address EVM, dari data tersimpan.
 *
 * 1. Address berlabel bridge/router (mis. tag Blockscout) dikenali sebagai
 *    kontrak protokol. Pengelompokan per protokol diambil dari nama label,
 *    jadi dicatat `heuristic` dengan keyakinan dan merujuk label aslinya.
 * 2. Kiriman address ini ke kontrak bridge dicocokkan dengan penerimaan ke
 *    address yang sama di chain lain (`matchBridgeSends`), lalu disimpan ke
 *    `bridge_transfers`. Menjalankan ulang memperbarui baris yang sama.
 * Tidak ada provider yang dihubungi.
 */
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import type { ConfidenceLevel } from '../database/schema/enums.js';
import { FlowsRepository } from '../flows/flows.repository.js';
import { assetKey, BRIDGE_MATCH_HEURISTIC, MAX_BRIDGE_DELAY_MS, matchBridgeSends, protocolFromLabel, type BridgeReceipt, type BridgeSend } from './bridge-matching.js';
import { MultichainRepository, type ChainRange, type MoveWithAsset } from './multichain.repository.js';

export const INFRASTRUCTURE_SOURCE = 'OpenChain heuristic';

export interface BridgeDetectionResult {
  sends: number;
  matched: number;
  pending: number;
  unmatched: number;
  /** Kontrak bridge/router yang baru atau sudah dikenali. */
  recognized: number;
}

const KEY = (move: Pick<MoveWithAsset, 'chainId' | 'table' | 'id'>) => `${move.chainId}:${move.table}:${move.id}`;

@Injectable()
export class BridgeDetectionService {
  constructor(
    private readonly repository: MultichainRepository,
    private readonly flows: FlowsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Kenali address berlabel bridge/router sebagai kontrak protokol. */
  async recognize(addressIds: number[]): Promise<number> {
    const rows = await this.repository.infrastructureLabels([...new Set(addressIds)]);
    const protocols = new Map<string, { id: string; name: string; kind: 'bridge' | 'router' }>();
    const contracts = rows.flatMap((label) => {
      const protocol = protocolFromLabel(label.name);
      if (!protocol) return [];
      const kind = label.labelType === 'bridge' ? 'bridge' : 'router';
      if (!protocols.has(protocol.id)) protocols.set(protocol.id, { ...protocol, kind });
      // Label eksternal lebih bisa dipegang daripada label dugaan; pengelompokannya tetap dugaan.
      const confidence = label.source === 'external' ? '0.800' : '0.500';
      return [
        {
          protocolId: protocol.id,
          chainId: label.chainId,
          addressId: label.addressId,
          role: kind === 'bridge' ? ('bridge_both' as const) : ('router' as const),
          source: 'heuristic' as const,
          sourceName: INFRASTRUCTURE_SOURCE,
          classification: 'heuristic' as const,
          confidence,
          labelId: label.id,
        },
      ];
    });
    await this.repository.saveInfrastructure([...protocols.values()], contracts);
    return contracts.length;
  }

  async detectForAddress(addressNormalized: string): Promise<BridgeDetectionResult> {
    const chains = await this.repository.evmChains();
    const addresses = await this.repository.addressesOn(
      chains.map((chain) => chain.id),
      addressNormalized,
    );
    const ranges: ChainRange[] = [];
    const coverage: Date[] = [];
    for (const address of addresses) {
      const scan = await this.flows.findScan(address.chainId, address.id);
      if (!scan) continue;
      ranges.push({ chainId: address.chainId, addressId: address.id, blockFrom: scan.blockFrom, blockTo: scan.blockTo });
      coverage.push(scan.windowTo);
    }

    const sendMoves = (await Promise.all(ranges.map((range) => this.repository.outgoingToBridges(range)))).flat();
    const bridgeIds = [...new Set(sendMoves.map((move) => move.toId))];
    const recognized = await this.recognize(bridgeIds);
    if (sendMoves.length === 0) return { sends: 0, matched: 0, pending: 0, unmatched: 0, recognized };

    const earliest = new Date(Math.min(...sendMoves.map((move) => move.timestamp.getTime())));
    const latest = new Date(Math.max(...sendMoves.map((move) => move.timestamp.getTime())) + MAX_BRIDGE_DELAY_MS);
    const receiptMoves = (await Promise.all(ranges.map((range) => this.repository.incomingBetween(range, earliest, latest)))).flat();

    const sends: BridgeSend[] = sendMoves.flatMap((move) => {
      const asset = assetKey(move.asset);
      return asset ? [{ key: KEY(move), chainId: move.chainId, asset, amountRaw: move.amountRaw, sentAt: move.timestamp }] : [];
    });
    const receipts: BridgeReceipt[] = receiptMoves.flatMap((move) => {
      const asset = assetKey(move.asset);
      return asset ? [{ key: KEY(move), chainId: move.chainId, asset, amountRaw: move.amountRaw, receivedAt: move.timestamp }] : [];
    });
    // Tidak cocok hanya bisa disimpulkan bila ada chain lain yang sudah terbaca melewati batas 24 jam.
    const coveredUntil = ranges.length > 1 ? new Date(Math.min(...coverage.map((date) => date.getTime()))) : null;
    const decisions = matchBridgeSends(sends, receipts, coveredUntil);

    const [contracts, labels] = await Promise.all([
      this.repository.infrastructureContractsFor(bridgeIds),
      this.repository.infrastructureLabels(bridgeIds),
    ]);
    const protocolOf = new Map(contracts.map((row) => [row.contract.addressId, row.protocol.id]));
    const labelOf = new Map(labels.filter((label) => label.labelType === 'bridge').map((label) => [label.addressId, label.id]));
    const moveByKey = new Map([...sendMoves, ...receiptMoves].map((move) => [KEY(move), move]));
    const addressOn = new Map(addresses.map((address) => [address.chainId, address.id]));
    const now = this.clock.now();

    const rows = decisions.map((decision) => {
      const sent = moveByKey.get(decision.sendKey)!;
      const received = decision.receipt ? moveByKey.get(decision.receipt.key)! : null;
      return {
        sourceChainId: sent.chainId,
        destChainId: received?.chainId ?? null,
        bridgeAddressId: sent.toId,
        bridgeLabelId: labelOf.get(sent.toId) ?? null,
        protocolId: protocolOf.get(sent.toId) ?? null,
        senderAddressId: sent.fromId,
        recipientAddressId: received ? (addressOn.get(received.chainId) ?? null) : null,
        sentNativeTransferId: sent.table === 'native' ? sent.id : null,
        sentTokenTransferId: sent.table === 'token' ? sent.id : null,
        receivedNativeTransferId: received?.table === 'native' ? received.id : null,
        receivedTokenTransferId: received?.table === 'token' ? received.id : null,
        amountSentRaw: sent.amountRaw,
        amountReceivedRaw: received?.amountRaw ?? null,
        status: decision.status,
        matchHeuristic: BRIDGE_MATCH_HEURISTIC,
        matchConfidence: decision.confidence as ConfidenceLevel | null,
        matchReason: decision.reason,
        sentAt: sent.timestamp,
        receivedAt: received?.timestamp ?? null,
        updatedAt: now,
      };
    });
    await this.repository.upsertBridgeTransfers(rows);
    return {
      sends: rows.length,
      matched: rows.filter((row) => row.status === 'matched').length,
      pending: rows.filter((row) => row.status === 'pending').length,
      unmatched: rows.filter((row) => row.status === 'unmatched').length,
      recognized,
    };
  }
}
