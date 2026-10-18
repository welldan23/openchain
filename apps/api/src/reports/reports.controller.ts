import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { CurrentAccount, SessionGuard, type SignedInRequest } from '../auth/session.guard.js';
import { parsePositiveInteger } from '../common/query-params.js';
import { ReportComposeService } from './report-compose.service.js';
import { EVIDENCE_FILTERS } from './report-evidence.js';
import { ReportEvidenceService } from './report-evidence.service.js';
import { REPORT_EXPORT_FORMATS, type ReportExportFormat } from './report-export.js';
import { ReportExportService } from './report-export.service.js';
import { parseCompose, parseEmbed, parseNewReport, parseNoteCreate, parseNoteUpdate, parseReportUpdate, parseShare, ReportInputError } from './report-input.js';
import { ReportShareService } from './report-share.service.js';
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
  ReportShareCreated,
  ReportSharesResponse,
  ReportSummaryView,
  ReportView,
} from './reports.types.js';

type Account = NonNullable<SignedInRequest['account']>;

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
 * `/:id/share` membuat, mendaftar, dan mencabut tautan berbagi publik.
 * Semua butuh masuk; laporan milik akun lain dijawab `404`. Tautan berbagi
 * dibuka lewat `/public/reports/:token` tanpa masuk.
 */
@Controller('reports')
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly composer: ReportComposeService,
    private readonly evidence: ReportEvidenceService,
    private readonly notes: ReportNotesService,
    private readonly exporter: ReportExportService,
    private readonly shares: ReportShareService,
  ) {}

  /** Id laporan milik akun ini; selain itu `404`. */
  private async owned(account: Account, value: string): Promise<number> {
    const id = idOf(value);
    await this.service.assertOwned(account.userId, id);
    return id;
  }

  @Get(':id/share')
  async shareList(@CurrentAccount() account: Account, @Param('id') id: string): Promise<ReportSharesResponse> {
    return this.shares.list(await this.owned(account, id));
  }

  @Post(':id/share')
  async share(@CurrentAccount() account: Account, @Param('id') id: string, @Body() body: unknown): Promise<ReportShareCreated> {
    return this.shares.create(await this.owned(account, id), parsed(() => parseShare(body)));
  }

  @Delete(':id/share/:linkId')
  @HttpCode(204)
  async revokeShare(@CurrentAccount() account: Account, @Param('id') id: string, @Param('linkId') linkId: string): Promise<void> {
    return this.shares.revoke(await this.owned(account, id), idOf(linkId, 'linkId'));
  }

  @Get(':id/export')
  async export(@CurrentAccount() account: Account, @Param('id') id: string, @Query('format') format?: string): Promise<StreamableFile> {
    if (format === undefined || !Object.hasOwn(REPORT_EXPORT_FORMATS, format)) {
      throw new BadRequestException(`Parameter format harus salah satu dari: ${Object.keys(REPORT_EXPORT_FORMATS).join(', ')}.`);
    }
    const file = await this.exporter.export(await this.owned(account, id), format as ReportExportFormat);
    return new StreamableFile(file.content, { type: file.mime, disposition: `attachment; filename="${file.fileName}"`, length: file.content.length });
  }

  @Get(':id/notes')
  async noteList(@CurrentAccount() account: Account, @Param('id') id: string): Promise<ReportNotesResponse> {
    return this.notes.list(await this.owned(account, id));
  }

  @Post(':id/notes')
  async createNote(@CurrentAccount() account: Account, @Param('id') id: string, @Body() body: unknown): Promise<ReportNoteResult> {
    return this.notes.create(await this.owned(account, id), parsed(() => parseNoteCreate(body)));
  }

  @Patch(':id/notes/:noteId')
  async updateNote(@CurrentAccount() account: Account, @Param('id') id: string, @Param('noteId') noteId: string, @Body() body: unknown): Promise<ReportNoteResult> {
    return this.notes.update(await this.owned(account, id), idOf(noteId, 'noteId'), parsed(() => parseNoteUpdate(body)));
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(204)
  async removeNote(@CurrentAccount() account: Account, @Param('id') id: string, @Param('noteId') noteId: string): Promise<void> {
    return this.notes.remove(await this.owned(account, id), idOf(noteId, 'noteId'));
  }

  @Get(':id/evidence')
  async evidenceList(@CurrentAccount() account: Account, @Param('id') id: string, @Query('filter') filter?: string): Promise<ReportEvidenceResponse> {
    const value = filter === undefined || filter === '' ? 'all' : filter;
    if (!(EVIDENCE_FILTERS as readonly string[]).includes(value)) throw new BadRequestException(`Parameter filter harus salah satu dari: ${EVIDENCE_FILTERS.join(', ')}.`);
    return this.evidence.list(await this.owned(account, id), value as ReportEvidenceFilter);
  }

  @Post(':id/evidence')
  @HttpCode(200)
  async embed(@CurrentAccount() account: Account, @Param('id') id: string, @Body() body: unknown): Promise<ReportEmbedResult> {
    return this.evidence.embed(await this.owned(account, id), parsed(() => parseEmbed(body)));
  }

  @Get()
  list(@CurrentAccount() account: Account): Promise<ReportSummaryView[]> {
    return this.service.list(account.userId);
  }

  @Get(':id')
  async get(@CurrentAccount() account: Account, @Param('id') id: string): Promise<ReportView> {
    return this.service.get(await this.owned(account, id));
  }

  @Get(':id/picker')
  async picker(@CurrentAccount() account: Account, @Param('id') id: string): Promise<ReportPickerResponse> {
    return this.composer.picker(await this.owned(account, id));
  }

  @Post(':id/compose')
  @HttpCode(200)
  async compose(@CurrentAccount() account: Account, @Param('id') id: string, @Body() body: unknown): Promise<ReportComposeResult> {
    return this.composer.compose(await this.owned(account, id), parsed(() => parseCompose(body)));
  }

  @Post()
  create(@CurrentAccount() account: Account, @Body() body: unknown): Promise<ReportView> {
    return this.service.create(account.userId, parsed(() => parseNewReport(body)));
  }

  @Patch(':id')
  async update(@CurrentAccount() account: Account, @Param('id') id: string, @Body() body: unknown): Promise<ReportView> {
    return this.service.update(await this.owned(account, id), parsed(() => parseReportUpdate(body)));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentAccount() account: Account, @Param('id') id: string): Promise<void> {
    return this.service.remove(await this.owned(account, id));
  }
}
