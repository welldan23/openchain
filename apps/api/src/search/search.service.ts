/**
 * Pencarian cepat: address persis, hash transaksi persis, atau teks (nama
 * token, simbol, nama label). Hanya dari data tersimpan; indeks teks dibangun
 * ulang dari tabel sumber paling sering sekali per `INDEX_MAX_AGE_MS`.
 */
import { Inject, Injectable } from '@nestjs/common';
import { EVM_CHAIN_DEFINITIONS, PHASE_4_CHAINS } from '../chains/chain-definitions.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { numericToNumber } from '../common/units.js';
import { normalizeAddress, normalizeTxHash } from '../database/identifiers.js';
import type { ChainFamily, RiskLevel } from '../database/schema/enums.js';
import { FlowsRepository } from '../flows/flows.repository.js';
import { sortLabels, toLabelView } from '../tokens/holders.mapper.js';
import { applyFilters, classifyQuery, dedupeResults, normalizeText, searchFacets, textTsQuery, MIN_TEXT_QUERY } from './search-query.js';
import { SearchRepository } from './search.repository.js';
import type { SearchFilters, SearchResponse, SearchResultView } from './search.types.js';

export const INDEX_MAX_AGE_MS = 60_000;
export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 100;
/** Kandidat teks yang dibaca sebelum filter, supaya jumlah facet tetap bermakna. */
const TEXT_CANDIDATES = 200;

const CHAIN_ORDER = [...EVM_CHAIN_DEFINITIONS.map((definition) => definition.id), ...PHASE_4_CHAINS];

function chainRank(chainId: string): number {
  return CHAIN_ORDER.includes(chainId) ? CHAIN_ORDER.indexOf(chainId) : CHAIN_ORDER.length;
}

function short(value: string): string {
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

@Injectable()
export class SearchService {
  private indexedAt = 0;

  constructor(
    private readonly repository: SearchRepository,
    private readonly flows: FlowsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Bangun ulang indeks teks bila sudah lebih tua dari batas, atau bila dipaksa. */
  async ensureIndex(force = false): Promise<void> {
    const now = this.clock.now();
    if (!force && now.getTime() - this.indexedAt < INDEX_MAX_AGE_MS) return;
    await this.repository.refreshIndex(now);
    this.indexedAt = now.getTime();
  }

  async search(rawQuery: string, filters: SearchFilters, limit = DEFAULT_SEARCH_LIMIT): Promise<SearchResponse> {
    const query = rawQuery.trim();
    const queryKind = classifyQuery(query);
    const chains = await this.flows.listChains();
    const idsOf = (family: ChainFamily) => chains.filter((chain) => chain.family === family).map((chain) => chain.id);

    let results: SearchResultView[] = [];
    const caveats: string[] = [];
    if (queryKind === 'evm_address' || queryKind === 'solana_address') {
      const family: ChainFamily = queryKind === 'evm_address' ? 'evm' : 'solana';
      results = await this.addressResults(normalizeAddress(family, query), idsOf(family), family);
    } else if (queryKind === 'evm_tx' || queryKind === 'solana_tx') {
      const family: ChainFamily = queryKind === 'evm_tx' ? 'evm' : 'solana';
      results = await this.transactionResults(normalizeTxHash(family, query), idsOf(family));
    } else if (queryKind === 'text') {
      const tsQuery = textTsQuery(query);
      if (tsQuery) {
        await this.ensureIndex();
        results = await this.textResults(query, tsQuery);
      } else {
        caveats.push(`Teks pencarian minimal ${MIN_TEXT_QUERY} huruf atau angka.`);
      }
    }

    const unique = dedupeResults(results);
    const filtered = applyFilters(unique, filters);
    if (queryKind !== 'empty' && unique.length === 0) {
      caveats.push(
        queryKind === 'text'
          ? 'Tidak ada token atau address berlabel yang cocok di data tersimpan. Ini bukan berarti entitasnya tidak ada di blockchain.'
          : 'Belum tercatat di data yang sudah diambil. Ini bukan berarti tidak ada di blockchain.',
      );
    }
    return {
      query,
      queryKind,
      filters,
      results: filtered.slice(0, limit),
      total: filtered.length,
      limit,
      facets: searchFacets(unique, filters, CHAIN_ORDER),
      caveats,
    };
  }

  private async labelsFor(addressIds: number[]) {
    const grouped = await this.flows.labelsByAddressIds([...new Set(addressIds)]);
    return (id: number) => {
      const rows = sortLabels(grouped.get(id) ?? []);
      return rows.length > 0 ? toLabelView(rows[0]) : null;
    };
  }

  private async tokenMeta(tokenIds: number[]) {
    const summaries = await this.repository.tokenSummaries(tokenIds);
    return (tokenId: number): SearchResultView['meta'] => {
      const summary = summaries.get(tokenId);
      return {
        kind: 'token',
        riskLevel: (summary?.riskLevel as RiskLevel | undefined) ?? null,
        findingCount: summary?.findingCount ?? null,
        holderCount: summary?.holderCount ?? null,
        priceUsd: numericToNumber(summary?.priceUsd ?? null),
        liquidityUsd: numericToNumber(summary?.liquidityUsd ?? null),
        snapshotAt: summary?.fetchedAt.toISOString() ?? null,
      };
    };
  }

  private async addressResults(normalized: string, chainIds: string[], family: ChainFamily): Promise<SearchResultView[]> {
    const rows = (await this.repository.exactAddress(normalized, chainIds)).sort((a, b) => chainRank(a.chainId) - chainRank(b.chainId));
    if (rows.length === 0) return [];
    const [labelOf, metaOf, scanned] = await Promise.all([
      this.labelsFor(rows.map((row) => row.addressId)),
      this.tokenMeta(rows.flatMap((row) => (row.tokenId === null ? [] : [row.tokenId]))),
      this.repository.scannedAddressIds(rows.map((row) => row.addressId)),
    ]);
    const results: SearchResultView[] = [];
    const wallets = rows.filter((row) => row.tokenId === null);
    for (const row of rows) {
      if (row.tokenId !== null) {
        results.push({
          id: `token:${row.chainId}:${row.address}`,
          kind: 'token',
          title: row.name && row.symbol ? `${row.name} (${row.symbol})` : (row.name ?? row.symbol ?? short(row.address)),
          subtitle: row.symbol,
          chain: row.chainId,
          chains: [row.chainId],
          label: labelOf(row.addressId),
          href: `/token/${row.chainId}/${row.address}`,
          matchedBy: 'Address kontrak token persis',
          meta: metaOf(row.tokenId),
        });
      }
    }
    for (const row of wallets) {
      const label = labelOf(row.addressId);
      results.push({
        id: `address:${row.chainId}:${row.address}`,
        kind: 'address',
        title: label?.name ?? short(row.address),
        subtitle: row.address,
        chain: row.chainId,
        chains: [row.chainId],
        label,
        href: `/flow/${row.chainId}/${row.address}`,
        matchedBy: 'Address persis',
        meta: { kind: 'address', view: 'flow', scannedChains: scanned.has(row.addressId) ? [row.chainId] : [] },
      });
    }
    // Address EVM yang dikenal di beberapa chain juga bisa dibuka sekaligus di Jelajah Multichain.
    if (family === 'evm' && wallets.length >= 2) {
      const label = wallets.map((row) => labelOf(row.addressId)).find((item) => item !== null) ?? null;
      results.push({
        id: `multichain:${normalized}`,
        kind: 'address',
        title: label?.name ?? short(wallets[0].address),
        subtitle: `${wallets.length} chain`,
        chain: null,
        chains: wallets.map((row) => row.chainId),
        label,
        href: `/multichain/${wallets[0].address}`,
        matchedBy: 'Address persis di beberapa chain',
        meta: { kind: 'address', view: 'multichain', scannedChains: wallets.filter((row) => scanned.has(row.addressId)).map((row) => row.chainId) },
      });
    }
    return results;
  }

  private async transactionResults(txHash: string, chainIds: string[]): Promise<SearchResultView[]> {
    const rows = (await this.repository.transactionsByHash(txHash, chainIds)).sort((a, b) => chainRank(a.chainId) - chainRank(b.chainId));
    return rows.map((row) => ({
      id: `transaction:${row.chainId}:${txHash}`,
      kind: 'transaction',
      title: `Transaksi ${short(txHash)}`,
      subtitle: `${row.movementCount} perpindahan dana`,
      chain: row.chainId,
      chains: [row.chainId],
      label: null,
      // Dibuka di halaman aliran dana pengirim, langsung ke bukti transaksinya.
      href: `/flow/${row.chainId}/${row.sender}#bukti-${txHash}`,
      matchedBy: 'Hash transaksi persis',
      meta: { kind: 'transaction', timestamp: row.timestamp.toISOString(), blockNumber: row.blockNumber, movementCount: row.movementCount },
    }));
  }

  private async textResults(query: string, tsQuery: string): Promise<SearchResultView[]> {
    const rows = await this.repository.textSearch(tsQuery, TEXT_CANDIDATES);
    const needle = normalizeText(query);
    const [labelOf, metaOf, scanned] = await Promise.all([
      this.labelsFor(rows.map((row) => row.addressId)),
      this.tokenMeta(rows.flatMap((row) => (row.tokenId === null ? [] : [row.tokenId]))),
      this.repository.scannedAddressIds(rows.filter((row) => row.kind === 'address').map((row) => row.addressId)),
    ]);
    return rows.map((row) => {
      const exact = normalizeText(row.title) === needle || (row.subtitle !== null && normalizeText(row.subtitle) === needle);
      const matchedBy = exact ? `Nama persis "${row.title}"` : `Nama mengandung "${query}"`;
      if (row.kind === 'token') {
        return {
          id: `token:${row.chainId}:${row.address}`,
          kind: 'token',
          title: row.title,
          subtitle: row.subtitle,
          chain: row.chainId,
          chains: [row.chainId],
          label: labelOf(row.addressId),
          href: `/token/${row.chainId}/${row.address}`,
          matchedBy,
          meta: metaOf(row.tokenId!),
        } satisfies SearchResultView;
      }
      return {
        id: `address:${row.chainId}:${row.address}`,
        kind: 'address',
        title: row.title,
        subtitle: row.address,
        chain: row.chainId,
        chains: [row.chainId],
        label: labelOf(row.addressId),
        href: `/flow/${row.chainId}/${row.address}`,
        matchedBy,
        meta: { kind: 'address', view: 'flow', scannedChains: scanned.has(row.addressId) ? [row.chainId] : [] },
      } satisfies SearchResultView;
    });
  }
}

