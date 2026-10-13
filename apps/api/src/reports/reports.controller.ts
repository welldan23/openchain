import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { parsePositiveInteger } from '../common/query-params.js';
import { ReportComposeService } from './report-compose.service.js';
import { EVIDENCE_FILTERS } from './report-evidence.js';
import { ReportEvidenceService } from './report-evidence.service.js';
import { parseCompose, parseEmbed, parseNewReport, parseReportUpdate, ReportInputError } from './report-input.js';
import { ReportsService } from './reports.service.js';
import type { ReportComposeResult, ReportEmbedResult, ReportEvidenceFilter, ReportEvidenceResponse, ReportPickerResponse, ReportSummaryView, ReportView } from './reports.types.js';

function parsed<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof ReportInputError) throw new BadRequestException(error.message);
    throw error;
  }
}

function idOf(value: string): number {
  const id = parsePositiveInteger(value, 'id');
  if (id === undefined) throw new BadRequestException('Parameter id wajib diisi.');
  return id;
}

/**
 * Laporan bukti investigasi. `GET` daftar dan detail (beserta bukti transaksi
 * dan kesiapan), `POST` laporan baru (opsional dari kasus), `PATCH /:id`
 * mengubah judul, ringkasan, status, atau seluruh isi bagian, `DELETE /:id`.
 * Laporan final dikunci; finalisasi ditolak `409` selama ada blocker.
 * `GET /:id/picker` memberi kandidat isi dari kasus sumber dan penilaian
 * risiko entitasnya; `POST /:id/compose` memasukkan pilihan sebagai blok.
 * `GET /:id/evidence` memberi semua hash bukti beserta tautan explorer dan
 * status semat; `POST /:id/evidence` menyematkan satu hash.
 */
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly composer: ReportComposeService,
    private readonly evidence: ReportEvidenceService,
  ) {}

  @Get(':id/evidence')
  evidenceList(@Param('id') id: string, @Query('filter') filter?: string): Promise<ReportEvidenceResponse> {
    const value = filter === undefined || filter === '' ? 'all' : filter;
    if (!(EVIDENCE_FILTERS as readonly string[]).includes(value)) throw new BadRequestException(`Parameter filter harus salah satu dari: ${EVIDENCE_FILTERS.join(', ')}.`);
    return this.evidence.list(idOf(id), value as ReportEvidenceFilter);
  }

  @Post(':id/evidence')
  @HttpCode(200)
  embed(@Param('id') id: string, @Body() body: unknown): Promise<ReportEmbedResult> {
    return this.evidence.embed(idOf(id), parsed(() => parseEmbed(body)));
  }

  @Get()
  list(): Promise<ReportSummaryView[]> {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<ReportView> {
    return this.service.get(idOf(id));
  }

  @Get(':id/picker')
  picker(@Param('id') id: string): Promise<ReportPickerResponse> {
    return this.composer.picker(idOf(id));
  }

  @Post(':id/compose')
  @HttpCode(200)
  compose(@Param('id') id: string, @Body() body: unknown): Promise<ReportComposeResult> {
    return this.composer.compose(idOf(id), parsed(() => parseCompose(body)));
  }

  @Post()
  create(@Body() body: unknown): Promise<ReportView> {
    return this.service.create(parsed(() => parseNewReport(body)));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<ReportView> {
    return this.service.update(idOf(id), parsed(() => parseReportUpdate(body)));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(idOf(id));
  }
}
