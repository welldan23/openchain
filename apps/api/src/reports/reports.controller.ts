import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { parsePositiveInteger } from '../common/query-params.js';
import { ReportComposeService } from './report-compose.service.js';
import { EVIDENCE_FILTERS } from './report-evidence.js';
import { ReportEvidenceService } from './report-evidence.service.js';
import { REPORT_EXPORT_FORMATS, type ReportExportFormat } from './report-export.js';
import { ReportExportService } from './report-export.service.js';
import { parseCompose, parseEmbed, parseNewReport, parseNoteCreate, parseNoteUpdate, parseReportUpdate, ReportInputError } from './report-input.js';
import { ReportNotesService } from './report-notes.service.js';
import { ReportsService } from './reports.service.js';
import type {
  ReportComposeResult,
  ReportEmbedResult,
  ReportEvidenceFilter,
  ReportEvidenceResponse,
  ReportNoteResult,
  ReportNotesResponse,
  ReportPickerResponse,
  ReportSummaryView,
  ReportView,
} from './reports.types.js';

function parsed<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof ReportInputError) throw new BadRequestException(error.message);
    throw error;
  }
}

function idOf(value: string, what = 'id'): number {
  const id = parsePositiveInteger(value, what);
  if (id === undefined) throw new BadRequestException(`Parameter ${what} wajib diisi.`);
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
 * status semat; `POST /:id/evidence` menyematkan satu hash. `/:id/notes`
 * mengelola catatan investigasi (daftar, tambah, ubah, hapus).
 * `GET /:id/export?format=csv|pdf` mengunduh laporan sebagai berkas.
 */
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly composer: ReportComposeService,
    private readonly evidence: ReportEvidenceService,
    private readonly notes: ReportNotesService,
    private readonly exporter: ReportExportService,
  ) {}

  @Get(':id/export')
  async export(@Param('id') id: string, @Query('format') format?: string): Promise<StreamableFile> {
    if (format === undefined || !Object.hasOwn(REPORT_EXPORT_FORMATS, format)) {
      throw new BadRequestException(`Parameter format harus salah satu dari: ${Object.keys(REPORT_EXPORT_FORMATS).join(', ')}.`);
    }
    const file = await this.exporter.export(idOf(id), format as ReportExportFormat);
    return new StreamableFile(file.content, { type: file.mime, disposition: `attachment; filename="${file.fileName}"`, length: file.content.length });
  }

  @Get(':id/notes')
  noteList(@Param('id') id: string): Promise<ReportNotesResponse> {
    return this.notes.list(idOf(id));
  }

  @Post(':id/notes')
  createNote(@Param('id') id: string, @Body() body: unknown): Promise<ReportNoteResult> {
    return this.notes.create(idOf(id), parsed(() => parseNoteCreate(body)));
  }

  @Patch(':id/notes/:noteId')
  updateNote(@Param('id') id: string, @Param('noteId') noteId: string, @Body() body: unknown): Promise<ReportNoteResult> {
    return this.notes.update(idOf(id), idOf(noteId, 'noteId'), parsed(() => parseNoteUpdate(body)));
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(204)
  removeNote(@Param('id') id: string, @Param('noteId') noteId: string): Promise<void> {
    return this.notes.remove(idOf(id), idOf(noteId, 'noteId'));
  }

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
