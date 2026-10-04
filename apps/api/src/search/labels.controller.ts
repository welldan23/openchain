import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service.js';
import type { LabelOptionsResponse, LabelSourceFilter } from './search.types.js';

const SOURCES: readonly LabelSourceFilter[] = ['all', 'external', 'heuristic'];

/**
 * Pilihan filter label (jenis, sumber, chain) beserta jumlah address-nya dari
 * data tersimpan. Filter `chains` (dipisah koma) dan `labelSource` sama dengan
 * `GET /api/search`.
 */
@Controller('labels')
export class LabelsController {
  constructor(private readonly service: SearchService) {}

  @Get()
  options(@Query('chains') chains?: string, @Query('labelSource') labelSource?: string): Promise<LabelOptionsResponse> {
    const parsedSource = (labelSource || 'all') as LabelSourceFilter;
    if (!SOURCES.includes(parsedSource)) throw new BadRequestException(`Parameter labelSource harus salah satu dari: ${SOURCES.join(', ')}.`);
    const parsedChains = [...new Set((chains ?? '').split(',').map((item) => item.trim()).filter((item) => item !== ''))];
    return this.service.labelOptions({ chains: parsedChains, labelSource: parsedSource });
  }
}
