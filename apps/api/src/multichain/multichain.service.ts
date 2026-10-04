/**
 * Aktivitas satu address EVM di semua chain EVM, dari data aliran dana yang
 * sudah tersimpan. Tidak ada provider yang dihubungi saat diminta.
 *
 * Ringkasan per chain disimpan sebagai `multichain_scans` supaya bisa dibuka
 * ulang (`?scan=`). Ringkasan tersimpan dipakai ulang selama pemindaian aliran
 * dana dasarnya belum berubah; permintaan yang disaring chain atau waktu tidak
 * disimpan.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EVM_CHAIN_DEFINITIONS } from '../chains/chain-definitions.js';
import { numericToNumber } from '../common/units.js';
import { InvalidIdentifierError, normalizeAddress } from '../database/identifiers.js';
import type { DataStatus } from '../database/schema/enums.js';
import type { addressFlowScans, chains, multichainChainActivity } from '../database/schema/index.js';
import { toChainInfo } from '../flows/flow-summary.mapper.js';
import { FlowsRepository } from '../flows/flows.repository.js';
import { sortLabels, toLabelView } from '../tokens/holders.mapper.js';
import { SnapshotFreshness } from '../tokens/snapshot-freshness.js';
import { effectiveStatus } from '../tokens/token-summary.mapper.js';
import { BridgeDetectionService } from './bridge-detection.service.js';
import { bridgeOfTransfers, bridgeViews, toActivityView } from './multichain.mapper.js';
import { columnLeaders, comparisonRows, sortComparison, summarizeComparison, type ComparisonKey, type SortDirection } from './multichain-comparison.js';
import { MultichainRepository, type ChainRange } from './multichain.repository.js';
import type {
  DetectedInfrastructureView,
  MultichainChainView,
  MultichainComparisonResponse,
  MultichainProfileResponse,
} from './multichain.types.js';

type ChainRow = typeof chains.$inferSelect;
type FlowScanRow = typeof addressFlowScans.$inferSelect;
type ActivityRowStored = typeof multichainChainActivity.$inferSelect;

export const DEFAULT_ACTIVITY_LIMIT = 100;
export const MAX_ACTIVITY_LIMIT = 500;

const CHAIN_ORDER = new Map(EVM_CHAIN_DEFINITIONS.map((definition, index) => [definition.id, index]));

export interface MultichainQuery {
  /** Hanya chain ini; kosong = semua chain EVM. */
  chains?: string[];
  from?: Date;
  to?: Date;
  /** Buka ringkasan tersimpan tertentu. */
  scanId?: number;
  limit?: number;
}

/** Satu chain yang sudah diputuskan pemindaian dasarnya. */
interface ChainPlan {
  chain: ChainRow;
  addressId: number | null;
  scan: FlowScanRow | null;
  /** Alasan bila chain ini belum terbaca. */
  missingReason: string | null;
}

@Injectable()
export class MultichainService {
  constructor(
    private readonly repository: MultichainRepository,
    private readonly flows: FlowsRepository,
    private readonly freshness: SnapshotFreshness,
    private readonly bridgesDetector: BridgeDetectionService,
  ) {}

  async getProfile(rawAddress: string, query: MultichainQuery = {}): Promise<MultichainProfileResponse> {
    let normalized: string;
    try {
      normalized = normalizeAddress('evm', rawAddress);
    } catch (error) {
      if (error instanceof InvalidIdentifierError) {
        throw new BadRequestException('Jelajah multichain saat ini hanya untuk address EVM (0x diikuti 40 karakter hex).');
      }
      throw error;
    }
    if (query.from && query.to && query.from > query.to) throw new BadRequestException('Parameter from tidak boleh sesudah to.');
    const limit = query.limit ?? DEFAULT_ACTIVITY_LIMIT;

    const all = (await this.repository.evmChains()).sort(
      (a, b) => (CHAIN_ORDER.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (CHAIN_ORDER.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id),
    );
    let selected = all;
    if (query.chains && query.chains.length > 0) {
      const unknown = query.chains.filter((id) => !all.some((chain) => chain.id === id));
      if (unknown.length > 0) throw new BadRequestException(`Chain tidak dikenal atau bukan EVM: ${unknown.join(', ')}.`);
      selected = all.filter((chain) => query.chains!.includes(chain.id));
    }
    const addressRows = await this.repository.addressesOn(
      selected.map((chain) => chain.id),
      normalized,
    );
    const addressOn = new Map(addressRows.map((row) => [row.chainId, row]));

    const filtered = (query.chains?.length ?? 0) > 0 || query.from !== undefined || query.to !== undefined;
    // Deteksi bridge dari data tersimpan dulu, supaya linimasa dan daftar bridge memakai hasil terbaru.
    const detection = query.scanId === undefined ? await this.bridgesDetector.detectForAddress(normalized) : null;
    let plans: ChainPlan[];
    let stored: Awaited<ReturnType<MultichainRepository['findScan']>> = null;
    let reused = false;
    if (query.scanId !== undefined) {
      stored = await this.repository.findScan(query.scanId);
      if (!stored || stored.scan.addressNormalized !== normalized) throw new NotFoundException(`Ringkasan lintas chain #${query.scanId} tidak ditemukan untuk address ini.`);
      const scans = new Map((await this.repository.scansByIds(stored.rows.flatMap((row) => (row.flowScanId === null ? [] : [row.flowScanId])))).map((scan) => [scan.id, scan]));
      plans = selected.flatMap((chain) => {
        const row = stored!.rows.find((item) => item.chainId === chain.id);
        if (!row) return [];
        return [{ chain, addressId: row.addressId, scan: row.flowScanId === null ? null : (scans.get(row.flowScanId) ?? null), missingReason: row.statusReason }];
      });
      reused = true;
    } else {
      plans = await Promise.all(selected.map((chain) => this.plan(chain, addressOn.get(chain.id)?.id ?? null)));
    }

    // Angka per chain selalu dihitung dari pemindaian dasarnya; ringkasan tersimpan
    // hanya menentukan pemindaian mana yang dipakai.
    const now = this.freshness.now();
    const latest = query.scanId === undefined && !filtered ? await this.repository.latestScan(normalized) : null;
    if (latest && sameScans(latest.rows, plans)) {
      stored = latest;
      reused = true;
    }
    const ranges = new Map<string, ChainRange>();
    for (const plan of plans) {
      if (plan.addressId !== null && plan.scan) {
        ranges.set(plan.chain.id, {
          chainId: plan.chain.id,
          addressId: plan.addressId,
          blockFrom: plan.scan.blockFrom,
          blockTo: plan.scan.blockTo,
          from: query.from,
          to: query.to,
        });
      }
    }
    const views: MultichainChainView[] = await Promise.all(plans.map((plan) => this.computeChain(plan, ranges.get(plan.chain.id), now)));

    if (!stored && !filtered) {
      const saved = await this.repository.saveScan(
        {
          family: 'evm',
          address: rawAddress.trim(),
          addressNormalized: normalized,
          windowFrom: windowOf(plans)?.from ?? now,
          windowTo: windowOf(plans)?.to ?? now,
          ...combinedStatus(views),
          scannedAt: now,
        },
        views.map((view, index) => ({
          chainId: view.chain.id,
          addressId: plans[index].addressId,
          flowScanId: view.flowScanId,
          status: view.status === 'stale' ? (plans[index].scan?.status ?? 'unavailable') : view.status,
          statusReason: view.statusReason,
          txCount: view.txCount,
          inUsd: view.inUsd === null ? null : view.inUsd.toFixed(2),
          outUsd: view.outUsd === null ? null : view.outUsd.toFixed(2),
          counterpartyCount: view.counterpartyCount,
          firstSeenAt: view.firstSeen ? new Date(view.firstSeen) : null,
          lastSeenAt: view.lastSeen ? new Date(view.lastSeen) : null,
          snapshotBlock: view.snapshotBlock,
          fetchedAt: view.fetchedAt ? new Date(view.fetchedAt) : null,
        })),
      );
      stored = saved;
    }

    // Linimasa gabungan semua chain, terbaru dulu.
    const perChain = await Promise.all([...ranges.values()].map((range) => this.repository.activities(range, limit + 1)));
    const merged = perChain.flat().sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime() || a.chainId.localeCompare(b.chainId) || b.id - a.id);
    const truncated = merged.length > limit;
    const page = merged.slice(0, limit);
    const ownIds = addressRows.map((row) => row.id);
    const counterpartyIds = [...new Set(page.map((row) => row.counterpartyId))];
    const [counterpartyAddresses, counterpartyLabels, ownLabels, bridgeIds, tokensById, bridgeRows] = await Promise.all([
      this.flows.addressesByIds(counterpartyIds),
      this.flows.labelsByAddressIds(counterpartyIds),
      this.flows.labelsByAddressIds(ownIds),
      this.repository.bridgeAddressIds(counterpartyIds),
      this.flows.tokensByIds([...new Set(page.flatMap((row) => (row.tokenId === null ? [] : [row.tokenId])))]),
      this.repository.bridgeTransfersFor(ownIds),
    ]);
    const bridgeOfTransfer = bridgeOfTransfers(bridgeRows);
    const chainById = new Map(all.map((chain) => [chain.id, chain]));
    const activities = page.map((row) => toActivityView(row, chainById.get(row.chainId)!, counterpartyAddresses, counterpartyLabels, bridgeIds, tokensById, bridgeOfTransfer));
    const bridges = await bridgeViews(bridgeRows, chainById, this.repository, this.flows);

    const infrastructure = await this.infrastructure([...ranges.values()], chainById);
    const runs = await this.flows.providerRunsByIds(plans.flatMap((plan) => (plan.scan?.providerRunId ? [plan.scan.providerRunId] : [])));
    const status = combinedStatus(views);
    const window = query.from || query.to ? windowFromQuery(query, plans) : windowOf(plans);
    const caveats = [
      'Setiap transfer di linimasa adalah fakta on-chain. Address yang sama di chain berbeda belum tentu dikendalikan orang yang sama (mis. kontrak dengan address sama).',
      'Chain yang belum dipindai tampil unavailable; itu bukan berarti tidak ada aktivitas di sana.',
      'Saldo native belum diambil, jadi saldo selalu kosong untuk sementara.',
    ];
    if (views.some((view) => (view.unpricedCount ?? 0) > 0)) {
      caveats.push('Sebagian transfer belum punya harga saat transaksi, jadi total USD hanya dari transfer yang berharga (kosong bila tidak ada).');
    }
    if (bridges.length === 0) caveats.push('Belum ada perpindahan bridge yang dicocokkan; kiriman ke bridge tetap tampil di linimasa sebagai bridge_out.');
    if (truncated) caveats.push(`Linimasa dibatasi ${limit} transfer terbaru.`);

    return {
      address: addressRows[0]?.address ?? rawAddress.trim(),
      family: 'evm',
      labels: sortLabels(ownIds.flatMap((id) => ownLabels.get(id) ?? [])).map(toLabelView),
      scan: stored && !filtered ? { id: stored.scan.id, scannedAt: stored.scan.scannedAt.toISOString(), reused } : null,
      window: window ? { from: window.from.toISOString(), to: window.to.toISOString() } : null,
      chains: views,
      activities,
      activityPage: { limit, truncated },
      bridges,
      infrastructure,
      bridgeDetection: detection ? { sends: detection.sends, matched: detection.matched, pending: detection.pending, unmatched: detection.unmatched } : null,
      sources: [...new Set(runs.map((run) => run.provider))].sort(),
      status: status.status,
      statusReason: status.statusReason,
      caveats,
    };
  }

  /** Tabel perbandingan antar chain dari profil yang sama dengan `getProfile`. */
  async compare(rawAddress: string, query: Omit<MultichainQuery, 'limit'>, key: ComparisonKey, direction: SortDirection): Promise<MultichainComparisonResponse> {
    // Linimasa tidak dipakai di sini, jadi cukup satu transfer.
    const profile = await this.getProfile(rawAddress, { ...query, limit: 1 });
    const rows = comparisonRows(profile.chains, profile.bridges);
    const caveats = [
      'Chain yang tidak terbaca tidak dihitung aktif maupun tidak aktif, dan tidak ikut dijumlahkan.',
      'Selisih USD hanya dihitung bila semua transfer chain itu punya harga saat transaksi.',
      'Saldo native belum diambil, jadi saldo selalu kosong untuk sementara.',
    ];
    if (rows.some((row) => row.status === 'stale')) caveats.push('Sebagian chain memakai pemindaian yang sudah lama (stale); angkanya bisa tertinggal.');
    return {
      address: profile.address,
      scan: profile.scan,
      window: profile.window,
      sort: { key, direction },
      rows: sortComparison(rows, key, direction),
      summary: summarizeComparison(rows, profile.bridges),
      leaders: columnLeaders(rows),
      status: profile.status,
      statusReason: profile.statusReason,
      caveats,
    };
  }

  /** Bridge dan router yang pernah jadi lawan transaksi, per protokol (atau per label bila belum dikenali). */
  private async infrastructure(ranges: ChainRange[], chainById: Map<string, ChainRow>): Promise<DetectedInfrastructureView[]> {
    const interactions = (await Promise.all(ranges.map((range) => this.repository.infrastructureInteractions(range)))).flat();
    if (interactions.length === 0) return [];
    const ids = [...new Set(interactions.map((item) => item.addressId))];
    // Kenali dulu semua bridge/router yang pernah jadi lawan transaksi (idempotent, dari label tersimpan).
    await this.bridgesDetector.recognize(ids);
    const [contracts, labelsById, addressById] = await Promise.all([
      this.repository.infrastructureContractsFor(ids),
      this.flows.labelsByAddressIds(ids),
      this.flows.addressesByIds(ids),
    ]);
    const protocolOf = new Map(contracts.map((row) => [row.contract.addressId, row.protocol]));
    const groups = new Map<string, DetectedInfrastructureView & { usd: number; priced: boolean }>();
    for (const item of interactions) {
      const labelRows = sortLabels(labelsById.get(item.addressId) ?? []).filter((label) => label.labelType === 'bridge' || label.labelType === 'router');
      const protocol = protocolOf.get(item.addressId);
      const type: 'bridge' | 'router' = protocol ? (protocol.kind === 'bridge' ? 'bridge' : 'router') : labelRows[0]?.labelType === 'bridge' ? 'bridge' : 'router';
      const name = protocol?.name ?? labelRows[0]?.name ?? addressById.get(item.addressId) ?? '';
      const key = protocol ? protocol.id : `${type}:${name}`;
      const group =
        groups.get(key) ??
        ({ key, type, name, protocolId: protocol?.id ?? null, labels: [], chains: [], addresses: [], interactions: 0, totalUsd: null, unpricedCount: 0, lastAt: item.lastAt.toISOString(), usd: 0, priced: false } as DetectedInfrastructureView & { usd: number; priced: boolean });
      group.interactions += item.interactions;
      group.unpricedCount += item.unpriced;
      if (item.totalUsd !== null) {
        group.usd += Number(item.totalUsd);
        group.priced = true;
      }
      if (!group.chains.includes(item.chainId)) group.chains.push(item.chainId);
      group.addresses.push({ chain: item.chainId, address: addressById.get(item.addressId) ?? '' });
      for (const label of labelRows.map(toLabelView)) {
        if (!group.labels.some((existing) => existing.name === label.name && existing.sourceName === label.sourceName)) group.labels.push(label);
      }
      if (item.lastAt.toISOString() > group.lastAt) group.lastAt = item.lastAt.toISOString();
      groups.set(key, group);
    }
    const order = (chain: string) => CHAIN_ORDER.get(chain) ?? (chainById.has(chain) ? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER);
    return [...groups.values()]
      .map(({ usd, priced, ...view }) => ({ ...view, totalUsd: priced ? Math.round(usd * 100) / 100 : null, chains: view.chains.sort((a, b) => order(a) - order(b)) }))
      .sort((a, b) => b.interactions - a.interactions || a.key.localeCompare(b.key));
  }

  private async plan(chain: ChainRow, addressId: number | null): Promise<ChainPlan> {
    if (addressId === null) return { chain, addressId, scan: null, missingReason: `Address ini belum pernah dipindai di ${chain.name}.` };
    const scan = await this.flows.findScan(chain.id, addressId);
    if (scan) return { chain, addressId, scan, missingReason: null };
    const failed = await this.flows.findFailedAttemptAfter(chain.id, addressId, null);
    return {
      chain,
      addressId,
      scan: null,
      missingReason: failed?.statusReason ?? `Address ini tercatat di ${chain.name} sebagai lawan transaksi, tapi riwayatnya sendiri belum dipindai.`,
    };
  }

  private async computeChain(plan: ChainPlan, range: ChainRange | undefined, now: Date): Promise<MultichainChainView> {
    const base = emptyView(plan);
    if (!plan.scan || !range) return base;
    const stats = await this.repository.chainStats(range);
    return {
      ...base,
      status: effectiveStatus(plan.scan.status, plan.scan.scannedAt, now, this.freshness.staleAfterMinutes),
      statusReason: plan.scan.statusReason,
      flowScanId: plan.scan.id,
      txCount: stats.txCount,
      inCount: stats.inCount,
      outCount: stats.outCount,
      inUsd: numericToNumber(stats.inUsd),
      outUsd: numericToNumber(stats.outUsd),
      unpricedCount: stats.unpricedCount,
      counterpartyCount: stats.counterpartyCount,
      firstSeen: stats.firstSeen?.toISOString() ?? null,
      lastSeen: stats.lastSeen?.toISOString() ?? null,
      snapshotBlock: plan.scan.blockTo,
      fetchedAt: plan.scan.scannedAt.toISOString(),
    };
  }

}

function emptyView(plan: ChainPlan): MultichainChainView {
  return {
    chain: toChainInfo(plan.chain),
    known: plan.addressId !== null,
    status: 'unavailable',
    statusReason: plan.missingReason,
    flowScanId: null,
    txCount: null,
    inCount: null,
    outCount: null,
    inUsd: null,
    outUsd: null,
    unpricedCount: null,
    counterpartyCount: null,
    firstSeen: null,
    lastSeen: null,
    nativeBalanceRaw: null,
    balanceUsd: null,
    snapshotBlock: null,
    fetchedAt: null,
  };
}

/** Ringkasan tersimpan masih berlaku bila setiap chain memakai pemindaian dasar yang sama. */
function sameScans(rows: readonly ActivityRowStored[], plans: readonly ChainPlan[]): boolean {
  if (rows.length !== plans.length) return false;
  return plans.every((plan) => {
    const row = rows.find((item) => item.chainId === plan.chain.id);
    return row !== undefined && row.flowScanId === (plan.scan?.id ?? null) && row.addressId === plan.addressId;
  });
}

function windowOf(plans: readonly ChainPlan[]): { from: Date; to: Date } | null {
  const scans = plans.flatMap((plan) => (plan.scan ? [plan.scan] : []));
  if (scans.length === 0) return null;
  return {
    from: new Date(Math.min(...scans.map((scan) => scan.windowFrom.getTime()))),
    to: new Date(Math.max(...scans.map((scan) => scan.windowTo.getTime()))),
  };
}

function windowFromQuery(query: MultichainQuery, plans: readonly ChainPlan[]): { from: Date; to: Date } | null {
  const coverage = windowOf(plans);
  const from = query.from ?? coverage?.from;
  const to = query.to ?? coverage?.to;
  return from && to ? { from, to } : null;
}

function combinedStatus(views: readonly MultichainChainView[]): { status: DataStatus; statusReason: string | null; missingFields: string[] } {
  const missing = views.filter((view) => view.status === 'unavailable');
  if (views.length > 0 && missing.length === views.length) {
    return { status: 'unavailable', statusReason: 'Address ini belum dipindai di chain mana pun.', missingFields: missing.map((view) => view.chain.id) };
  }
  const incomplete = views.filter((view) => view.status !== 'complete');
  if (incomplete.length === 0) return { status: 'complete', statusReason: null, missingFields: [] };
  return {
    status: 'partial',
    statusReason: `${incomplete.length} dari ${views.length} chain belum terbaca lengkap: ${incomplete.map((view) => view.chain.name).join(', ')}.`,
    missingFields: incomplete.map((view) => view.chain.id),
  };
}
