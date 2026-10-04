import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { parsePositiveInteger } from '../common/query-params.js';
import { entityLabelType } from '../database/schema/enums.js';
import type { LabelSourceFilter, ResultKindFilter, SearchResponse } from './search.types.js';
import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT, SearchService } from './search.service.js';

const KINDS: readonly ResultKindFilter[] = ['all', 'token', 'address', 'transaction'];
const SOURCES: readonly LabelSourceFilter[] = ['all', 'external', 'heuristic'];
const LABEL_KEYS = new Set<string>([...entityLabelType.enumValues, 'none']);

function list(value: string | undefined): string[] {
  return [...new Set((value ?? '').split(',').map((item) => item.trim()).filter((item) => item !== ''))];
}

/**
 * Pencarian cepat. `?q=` address, hash transaksi, atau teks; filter `kind`,
 * `chains`, `labels` (jenis label utama, `none` = tanpa label), `labelSource`,
 * dan `limit` (1–100). Hanya dari data tersimpan.
 */
@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  async search(
    @Query('q') q?: string,
    @Query('kind') kind?: string,
    @Query('chains') chains?: string,
    @Query('labels') labels?: string,
    @Query('labelSource') labelSource?: string,
    @Query('limit') limit?: string,
  ): Promise<SearchResponse> {
    const parsedKind = (kind || 'all') as ResultKindFilter;
    if (!KINDS.includes(parsedKind)) throw new BadRequestException(`Parameter kind harus salah satu dari: ${KINDS.join(', ')}.`);
    const parsedSource = (labelSource || 'all') as LabelSourceFilter;
    if (!SOURCES.includes(parsedSource)) throw new BadRequestException(`Parameter labelSource harus salah satu dari: ${SOURCES.join(', ')}.`);
    const parsedLabels = list(labels);
    const unknownLabels = parsedLabels.filter((item) => !LABEL_KEYS.has(item));
    if (unknownLabels.length > 0) throw new BadRequestException(`Label tidak dikenal: ${unknownLabels.join(', ')}.`);
    const parsedLimit = parsePositiveInteger(limit, 'limit') ?? DEFAULT_SEARCH_LIMIT;
    if (parsedLimit > MAX_SEARCH_LIMIT) throw new BadRequestException(`Parameter limit maksimal ${MAX_SEARCH_LIMIT}.`);
    if ((q ?? '').length > 200) throw new BadRequestException('Teks pencarian maksimal 200 karakter.');
    return this.service.search(q ?? '', { kind: parsedKind, chains: list(chains), labels: parsedLabels, labelSource: parsedSource }, parsedLimit);
  }
}
