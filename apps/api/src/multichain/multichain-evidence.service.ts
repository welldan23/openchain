/**
 * Bukti hash transaksi sumber untuk Jelajah Multichain: satu aktivitas di
 * linimasa, atau kedua kaki sebuah perpindahan bridge. Transfer harus milik
 * address yang diminta; selain itu dijawab 404, tidak ditampilkan. Hanya dari
 * data tersimpan.
 */
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { InvalidIdentifierError, normalizeAddress } from '../database/identifiers.js';
import { movementKey, toMovementType } from '../flows/flow-summary.mapper.js';
import { FlowsRepository } from '../flows/flows.repository.js';
import { TransactionEvidenceService } from '../flows/transaction-evidence.service.js';
import { bridgeChecks, type BridgeLeg } from './bridge-checks.js';
import { assetKey } from './bridge-matching.js';
import { bridgeOfTransfers, bridgeViews, toActivityView } from './multichain.mapper.js';
import { MultichainRepository } from './multichain.repository.js';
import type { ActivityEvidenceResponse, BridgeEvidenceResponse } from './multichain.types.js';

const ACTIVITY_ID = /^([a-z0-9-]+):(native|token):(\d+)$/;

type TransferDetail = NonNullable<Awaited<ReturnType<MultichainRepository['transferDetail']>>>;

function leg(transfer: TransferDetail): BridgeLeg {
  const asset =
    transfer.source === 'token'
      ? assetKey({ type: 'token', symbol: transfer.symbol, decimals: transfer.decimals })
      : assetKey({ type: 'native', symbol: transfer.symbol ?? '' });
  return { asset, symbol: transfer.symbol ?? 'aset tanpa simbol', amountRaw: transfer.amountRaw, at: transfer.timestamp };
}

@Injectable()
export class MultichainEvidenceService {
  constructor(
    private readonly repository: MultichainRepository,
    private readonly flows: FlowsRepository,
    private readonly transactions: TransactionEvidenceService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async getActivity(rawAddress: string, activityId: string): Promise<ActivityEvidenceResponse> {
    const match = ACTIVITY_ID.exec(activityId);
    const transferId = match ? Number(match[3]) : NaN;
    if (!match || !Number.isSafeInteger(transferId) || transferId === 0) {
      throw new BadRequestException('Id aktivitas harus berbentuk <chain>:native:<angka> atau <chain>:token:<angka>, seperti di linimasa.');
    }
    const { addresses } = await this.resolve(rawAddress);
    const transfer = await this.repository.transferDetail(match[2] as 'native' | 'token', transferId);
    const own = addresses.find((item) => item.chainId === match[1]);
    if (!transfer || transfer.chainId !== match[1] || !own || (transfer.fromId !== own.id && transfer.toId !== own.id)) {
      throw new NotFoundException(`Aktivitas ${activityId} tidak ditemukan untuk address ini.`);
    }

    const direction = transfer.fromId === transfer.toId ? 'self' : transfer.toId === own.id ? 'in' : 'out';
    const counterpartyId = direction === 'in' ? transfer.fromId : transfer.toId;
    const [chains, addressById, labelsById, bridgeIds, tokensById, bridges, movements, transaction] = await Promise.all([
      this.repository.evmChains(),
      this.flows.addressesByIds([counterpartyId]),
      this.flows.labelsByAddressIds([counterpartyId]),
      this.repository.bridgeAddressIds([counterpartyId]),
      this.flows.tokensByIds(transfer.tokenId === null ? [] : [transfer.tokenId]),
      this.repository.bridgeTransfersFor(addresses.map((item) => item.id)),
      this.flows.movementTypesFor([{ source: transfer.source, id: transfer.id }]),
      this.transactions.getEvidence(transfer.chainId, transfer.txHash),
    ]);
    const chain = chains.find((item) => item.id === transfer.chainId)!;
    const activity = toActivityView(
      { ...transfer, direction, counterpartyId },
      chain,
      addressById,
      labelsById,
      bridgeIds,
      tokensById,
      bridgeOfTransfers(bridges),
    );
    return {
      address: own.address,
      activity: { ...activity, movement: toMovementType(movements.get(movementKey(transfer.source, transfer.id))) },
      transaction,
      caveats: [
        'Transfer ini fakta on-chain dan bisa dicek ulang lewat hash transaksinya di explorer.',
        ...(activity.kind === 'bridge_out' || activity.kind === 'bridge_in'
          ? ['Lawan transaksinya dikenali sebagai bridge dari labelnya; label bisa keliru.']
          : []),
      ],
    };
  }

  async getBridge(rawAddress: string, bridgeId: number): Promise<BridgeEvidenceResponse> {
    const { addresses } = await this.resolve(rawAddress);
    const row = await this.repository.findBridgeTransfer(bridgeId);
    const ownIds = new Set(addresses.map((item) => item.id));
    if (!row || (!ownIds.has(row.senderAddressId) && (row.recipientAddressId === null || !ownIds.has(row.recipientAddressId)))) {
      throw new NotFoundException(`Perpindahan bridge #${bridgeId} tidak ditemukan untuk address ini.`);
    }
    type Ref = { table: 'native' | 'token'; id: number };
    const sentRef: Ref = row.sentNativeTransferId !== null ? { table: 'native', id: row.sentNativeTransferId } : { table: 'token', id: row.sentTokenTransferId! };
    const receivedRef: Ref | null =
      row.receivedNativeTransferId !== null
        ? { table: 'native', id: row.receivedNativeTransferId }
        : row.receivedTokenTransferId !== null
          ? { table: 'token', id: row.receivedTokenTransferId }
          : null;
    const [chains, sent, received] = await Promise.all([
      this.repository.evmChains(),
      this.repository.transferDetail(sentRef.table, sentRef.id),
      receivedRef ? this.repository.transferDetail(receivedRef.table, receivedRef.id) : null,
    ]);
    if (!sent) throw new Error(`Kaki kirim bridge #${bridgeId} tidak tersimpan`);
    const chainById = new Map(chains.map((chain) => [chain.id, chain]));
    const [[view], sentEvidence, receivedEvidence] = await Promise.all([
      bridgeViews([row], chainById, this.repository, this.flows),
      this.transactions.getEvidence(sent.chainId, sent.txHash),
      received ? this.transactions.getEvidence(received.chainId, received.txHash) : null,
    ]);
    const caveats = ['Kaki kirim adalah fakta on-chain. Pasangan kaki terima adalah dugaan dari aset, jumlah, dan waktu, bukan bukti dari bridge itu sendiri.'];
    if (!received) caveats.push('Penerimaan belum ditemukan: chain tujuan bisa belum dipindai, atau dana dikirim ke address lain.');
    return {
      address: addresses.find((item) => item.id === row.senderAddressId)?.address ?? addresses[0].address,
      bridge: view,
      checks: bridgeChecks(leg(sent), received ? leg(received) : null, this.clock.now()),
      sent: sentEvidence,
      received: receivedEvidence,
      caveats,
    };
  }

  private async resolve(rawAddress: string) {
    let normalized: string;
    try {
      normalized = normalizeAddress('evm', rawAddress);
    } catch (error) {
      if (error instanceof InvalidIdentifierError) throw new BadRequestException('Jelajah multichain saat ini hanya untuk address EVM (0x diikuti 40 karakter hex).');
      throw error;
    }
    const chains = await this.repository.evmChains();
    const addresses = await this.repository.addressesOn(
      chains.map((chain) => chain.id),
      normalized,
    );
    if (addresses.length === 0) throw new NotFoundException(`Address ${rawAddress.trim()} belum pernah tercatat di chain EVM mana pun.`);
    return { normalized, addresses };
  }
}
