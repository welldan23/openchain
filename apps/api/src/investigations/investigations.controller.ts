import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { CurrentAccount, SessionGuard, type SignedInRequest } from '../auth/session.guard.js';
import { parsePositiveInteger } from '../common/query-params.js';
import { investigationKind, type InvestigationKind } from '../database/schema/enums.js';
import { InvestigationInputError, parseNewInvestigation, parseNote } from './investigation-input.js';
import type { InvestigationEntryView, InvestigationListResponse } from './investigations.types.js';
import { DEFAULT_HISTORY_LIMIT, InvestigationsService, MAX_HISTORY_LIMIT } from './investigations.service.js';

type Account = NonNullable<SignedInRequest['account']>;

/**
 * Riwayat investigasi. `GET` daftar terbaru dulu (`?kind=`, `?limit=` 1–200),
 * `POST` mencatat halaman yang dibuka, `PATCH /:id` menyimpan atau menghapus
 * catatannya (`{ note }`, kosong = hapus), `DELETE /:id` menghapus satu
 * riwayat beserta catatannya. Semua butuh masuk; tiap akun hanya melihat dan mengubah
 * riwayatnya sendiri.
 */
@Controller('investigations')
@UseGuards(SessionGuard)
export class InvestigationsController {
  constructor(private readonly service: InvestigationsService) {}

  @Get()
  list(@CurrentAccount() account: Account, @Query('kind') kind?: string, @Query('limit') limit?: string): Promise<InvestigationListResponse> {
    if (kind !== undefined && kind !== '' && !(investigationKind.enumValues as readonly string[]).includes(kind)) {
      throw new BadRequestException(`Parameter kind harus salah satu dari: ${investigationKind.enumValues.join(', ')}.`);
    }
    const parsedLimit = parsePositiveInteger(limit, 'limit') ?? DEFAULT_HISTORY_LIMIT;
    if (parsedLimit > MAX_HISTORY_LIMIT) throw new BadRequestException(`Parameter limit maksimal ${MAX_HISTORY_LIMIT}.`);
    return this.service.list(account.userId, (kind || undefined) as InvestigationKind | undefined, parsedLimit);
  }

  @Post()
  async record(@CurrentAccount() account: Account, @Body() body: unknown, @Res({ passthrough: true }) response: { status(code: number): unknown }): Promise<InvestigationEntryView> {
    let input;
    try {
      input = parseNewInvestigation(body);
    } catch (error) {
      if (error instanceof InvestigationInputError) throw new BadRequestException(error.message);
      throw error;
    }
    const { entry, created } = await this.service.record(account.userId, input);
    response.status(created ? 201 : 200);
    return entry;
  }

  @Patch(':id')
  updateNote(@CurrentAccount() account: Account, @Param('id') id: string, @Body() body: unknown): Promise<InvestigationEntryView> {
    const parsed = parsePositiveInteger(id, 'id');
    if (parsed === undefined) throw new BadRequestException('Id riwayat wajib diisi.');
    if (body === null || typeof body !== 'object' || Array.isArray(body) || !('note' in body)) throw new BadRequestException('Isi permintaan harus { "note": "…" }; kosong menghapus catatan.');
    let note: string | null;
    try {
      note = parseNote((body as { note: unknown }).note);
    } catch (error) {
      if (error instanceof InvestigationInputError) throw new BadRequestException(error.message);
      throw error;
    }
    return this.service.updateNote(account.userId, parsed, note);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentAccount() account: Account, @Param('id') id: string): Promise<void> {
    const parsed = parsePositiveInteger(id, 'id');
    if (parsed === undefined) throw new BadRequestException('Id riwayat wajib diisi.');
    await this.service.remove(account.userId, parsed);
  }
}
