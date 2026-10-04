import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvalidIdentifierError, normalizeAddress } from '../database/identifiers.js';
import { type FlowRangeRequest, resolveFlowWindow, type ResolvedWindow } from './flow-range.js';
import { FlowsRepository, type ScanRow, type ScanSelector } from './flows.repository.js';

export interface FlowQuery extends ScanSelector, FlowRangeRequest {}

export interface FlowContext {
  chain: NonNullable<Awaited<ReturnType<FlowsRepository['findChain']>>>;
  address: { id: number; address: string };
  scan: ScanRow | null;
  failedAttempt: ScanRow | null;
  window: ResolvedWindow | null;
}

/**
 * Langkah bersama endpoint aliran dana: validasi chain, normalisasi address,
 * cari address, pilih pemindaian, lalu hitung rentang waktu di dalam
 * cakupannya. Melempar 404/400 dengan pesan yang jelas.
 */
@Injectable()
export class FlowLookupService {
  constructor(private readonly repository: FlowsRepository) {}

  async resolve(chainId: string, rawAddress: string, query: FlowQuery = {}): Promise<FlowContext> {
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('Parameter from harus sebelum atau sama dengan to.');
    }
    const chain = await this.repository.findChain(chainId);
    if (!chain) throw new NotFoundException(`Chain "${chainId}" tidak dikenal.`);

    let normalized: string;
    try {
      normalized = normalizeAddress(chain.family, rawAddress);
    } catch (error) {
      if (error instanceof InvalidIdentifierError) throw new BadRequestException(error.message);
      throw error;
    }
    const address = await this.repository.findAddress(chain.id, normalized);
    if (!address) {
      throw new NotFoundException(`Address ${rawAddress.trim()} belum pernah dipindai di ${chain.name}.`);
    }

    const scan = await this.repository.findScan(chain.id, address.id, query);
    if (query.scanId !== undefined && !scan) {
      throw new NotFoundException(`Pemindaian #${query.scanId} untuk address ini tidak ditemukan${query.at ? ' sampai waktu itu' : ''}.`);
    }
    const failedAttempt = await this.repository.findFailedAttemptAfter(chain.id, address.id, scan?.scannedAt ?? null, query.at);
    return { chain, address, scan, failedAttempt, window: scan ? resolveFlowWindow(scan, query) : null };
  }
}
