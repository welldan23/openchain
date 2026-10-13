/**
 * Ringkasan skor risiko objek dari penilaian tersimpan. Objek yang belum
 * pernah dinilai langsung dinilai dari data tersimpan; `refresh` menilai
 * ulang. Tidak menghubungi provider.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeAddress } from '../database/identifiers.js';
import type { ChainFamily } from '../database/schema/enums.js';
import { FlowsRepository } from '../flows/flows.repository.js';
import { sortLabels, toLabelView } from '../tokens/holders.mapper.js';
import { RISK_METHODOLOGY } from './risk-rules.js';
import { objectKindOf, RiskScoringError, RiskScoringService } from './risk-scoring.service.js';
import { riskLinks, riskTitle, toSummaryView } from './risk-summary.mapper.js';
import { RiskRepository, type RiskObjectRow } from './risk.repository.js';
import type { MultichainRiskResponse, RiskNoDataView, RiskSummaryView } from './risk.types.js';

/** Terjemahkan galat skoring ke respons HTTP yang jelas. */
export function toHttpError(error: unknown): never {
  if (error instanceof RiskScoringError) {
    if (error.code === 'address_not_found') throw new NotFoundException(error.message);
    throw new BadRequestException(error.message);
  }
  throw error;
}

@Injectable()
export class RiskSummaryService {
  constructor(
    private readonly repository: RiskRepository,
    private readonly scoring: RiskScoringService,
    private readonly flows: FlowsRepository,
  ) {}

  async summary(chainId: string, rawAddress: string, refresh = false): Promise<RiskSummaryView> {
    const [result] = await this.summaries(rawAddress, chainId, refresh);
    if (result.status === 'no_data') throw new NotFoundException(result.reason);
    return result;
  }

  async multichain(rawAddress: string, refresh = false): Promise<MultichainRiskResponse> {
    const chains = await this.summaries(rawAddress, undefined, refresh);
    const scored = chains.filter((item): item is RiskSummaryView => item.status === 'assessed' && item.score !== null);
    const [top] = [...scored].sort((a, b) => b.score! - a.score! || a.chain.localeCompare(b.chain));
    const caveats = ['Setiap chain dinilai sendiri dari data tersimpannya; skor antar chain tidak dijumlahkan.'];
    if (chains.some((item) => item.status === 'no_data')) caveats.push('Sebagian chain belum punya data yang bisa dinilai. Itu bukan berarti aman di chain tersebut.');
    return { address: rawAddress.trim(), chains, highest: top ? { chain: top.chain, score: top.score!, level: top.level } : null, caveats };
  }

  private async summaries(rawAddress: string, chainId: string | undefined, refresh: boolean): Promise<Array<RiskSummaryView | RiskNoDataView>> {
    const chains = await this.repository.chains();
    // Penilaian dijalankan bila diminta ulang atau ada chain yang belum pernah dinilai.
    let objects: RiskObjectRow[];
    let fresh = new Map<string, Awaited<ReturnType<RiskScoringService['assessAddress']>>[number]>();
    try {
      if (refresh) {
        const results = await this.scoring.assessAddress(rawAddress, chainId);
        fresh = new Map(results.map((item) => [item.chainId, item]));
      }
      const family: ChainFamily | undefined = chainId ? chains.find((item) => item.id === chainId)?.family : /^0x[0-9a-fA-F]{40}$/.test(rawAddress.trim()) ? 'evm' : 'solana';
      if (!family) throw new RiskScoringError('chain_not_found', `Chain "${chainId}" tidak dikenal.`);
      const chainIds = chainId ? [chainId] : chains.filter((item) => item.family === family).map((item) => item.id);
      objects = await this.repository.objects(chainIds, normalizeAddressSafe(family, rawAddress));
      if (objects.length === 0) throw new RiskScoringError('address_not_found', `Address ${rawAddress.trim()} belum pernah tercatat di data tersimpan.`);
      const missing = [];
      for (const object of objects) {
        if (!fresh.has(object.chainId) && !(await this.repository.latestAssessment(object.chainId, object.addressId, RISK_METHODOLOGY))) missing.push(object.chainId);
      }
      for (const id of missing) {
        const [result] = await this.scoring.assessAddress(rawAddress, id);
        fresh.set(id, result);
      }
    } catch (error) {
      toHttpError(error);
    }

    const labels = await this.flows.labelsByAddressIds(objects.map((object) => object.addressId));
    const views: Array<RiskSummaryView | RiskNoDataView> = [];
    for (const object of objects) {
      const kind = objectKindOf(object);
      const assessment = await this.repository.latestAssessment(object.chainId, object.addressId, RISK_METHODOLOGY);
      if (!assessment) {
        const result = fresh.get(object.chainId);
        views.push({
          status: 'no_data',
          chain: object.chainId,
          address: object.address,
          objectKind: kind,
          reason: result?.status === 'no_data' ? result.reason : 'Belum ada data tersimpan yang bisa dinilai di chain ini.',
        });
        continue;
      }
      const sorted = sortLabels(labels.get(object.addressId) ?? []);
      const label = sorted.length > 0 ? toLabelView(sorted[0]) : null;
      const token = object.tokenId === null ? null : await this.repository.tokenInfo(object.tokenId);
      const latestData =
        kind === 'token' ? await this.repository.latestTokenSnapshot(object.tokenId!) : await this.repository.latestFlowScan(object.chainId, object.addressId);
      const parts = await this.repository.assessmentParts(assessment.id);
      const family = chains.find((item) => item.id === object.chainId)?.family ?? 'evm';
      views.push(
        toSummaryView({
          address: object.address,
          title: riskTitle(kind, object.address, token, label),
          label,
          assessment,
          ...parts,
          newerDataAvailable: latestData !== null && latestData.blockNumber > assessment.blockNumber,
          links: riskLinks(kind, object.chainId, object.address, family, token?.hasMap ?? false),
        }),
      );
    }
    return views;
  }
}

function normalizeAddressSafe(family: ChainFamily, raw: string): string {
  try {
    return normalizeAddress(family, raw);
  } catch {
    throw new RiskScoringError('invalid_address', `Address tidak valid untuk chain ${family === 'evm' ? 'EVM' : 'Solana'}.`);
  }
}
