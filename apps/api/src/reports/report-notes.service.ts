/**
 * Catatan investigasi di laporan: daftar, tambah, ubah, hapus. Catatan boleh
 * dikaitkan ke satu klaim di laporan yang sama. Mengubah catatan menyimpan
 * waktu ubahnya; waktu dibuat tetap. Laporan final dikunci.
 */
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import type { NoteCreateInput, NoteUpdateInput } from './report-input.js';
import { NOTES_SECTION, notesSectionAt, claimOptions, reportNotes } from './report-notes.js';
import { ReportsRepository, type Executor } from './reports.repository.js';
import { ReportsService } from './reports.service.js';
import type { ReportNoteResult, ReportNotesResponse } from './reports.types.js';

@Injectable()
export class ReportNotesService {
  constructor(
    private readonly reports: ReportsService,
    private readonly repository: ReportsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(id: number): Promise<ReportNotesResponse> {
    await this.editable(id, false);
    const sections = (await this.repository.sectionsOf([id])).get(id) ?? [];
    return { reportId: String(id), notes: reportNotes(sections), claimOptions: claimOptions(sections) };
  }

  async create(id: number, input: NoteCreateInput): Promise<ReportNoteResult> {
    await this.editable(id);
    const now = this.clock.now();
    const noteId = await this.repository.db.transaction(async (tx) => {
      if (input.claimBlockId !== null) await this.assertClaim(tx, id, input.claimBlockId);
      const [created] = await this.repository.appendBlocks(tx, id, NOTES_SECTION, [{ kind: 'note', id: null, body: input.body, claimBlockId: null, sourceKey: null }], notesSectionAt, now);
      if (input.claimBlockId !== null) await this.repository.updateBlock(tx, created, { claimBlockId: input.claimBlockId });
      await this.repository.updateReport(tx, id, { updatedAt: now });
      return created;
    });
    return this.result(id, noteId);
  }

  async update(id: number, noteId: number, input: NoteUpdateInput): Promise<ReportNoteResult> {
    await this.editable(id);
    const now = this.clock.now();
    await this.repository.db.transaction(async (tx) => {
      const note = await this.note(tx, id, noteId);
      if (input.claimBlockId !== undefined && input.claimBlockId !== null) await this.assertClaim(tx, id, input.claimBlockId);
      const body = input.body ?? note.body;
      const claimBlockId = input.claimBlockId === undefined ? note.claimBlockId : input.claimBlockId;
      if (body === note.body && claimBlockId === note.claimBlockId) return;
      await this.repository.updateBlock(tx, noteId, { body, claimBlockId, editedAt: now });
      await this.repository.updateReport(tx, id, { updatedAt: now });
    });
    return this.result(id, noteId);
  }

  async remove(id: number, noteId: number): Promise<void> {
    await this.editable(id);
    const now = this.clock.now();
    await this.repository.db.transaction(async (tx) => {
      await this.note(tx, id, noteId);
      await this.repository.deleteBlock(tx, noteId);
      await this.repository.updateReport(tx, id, { updatedAt: now });
    });
  }

  private async editable(id: number, mustBeOpen = true): Promise<void> {
    const row = await this.repository.find(id);
    if (!row) throw new NotFoundException(`Laporan ${id} tidak ditemukan.`);
    if (mustBeOpen && row.status === 'final') throw new ConflictException('Laporan final dikunci. Ubah statusnya ke review atau draft dulu sebelum mengubah catatan.');
  }

  private async note(executor: Executor, id: number, noteId: number) {
    const block = await this.repository.findBlock(id, noteId, executor);
    if (!block || block.kind !== 'note') throw new NotFoundException(`Catatan ${noteId} tidak ada di laporan ini.`);
    return block;
  }

  private async assertClaim(executor: Executor, id: number, blockId: number): Promise<void> {
    const block = await this.repository.findBlock(id, blockId, executor);
    if (!block || block.kind !== 'claim') throw new BadRequestException(`Blok ${blockId} bukan klaim di laporan ini.`);
  }

  private async result(id: number, noteId: number): Promise<ReportNoteResult> {
    const report = await this.reports.get(id);
    const note = reportNotes(report.sections).find((item) => item.id === String(noteId))!;
    return { report, note };
  }
}
