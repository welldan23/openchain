import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentAccount, SessionGuard, type SignedInRequest } from '../auth/session.guard.js';
import { parsePositiveInteger } from '../common/query-params.js';
import { CaseInputError, parseItems, parseNewCase, parseUpdate } from './case-input.js';
import { CasesService } from './cases.service.js';
import type { CaseSummaryView, CaseView, SaveToCaseResult } from './cases.types.js';

type Account = NonNullable<SignedInRequest['account']>;

function parsed<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof CaseInputError) throw new BadRequestException(error.message);
    throw error;
  }
}

function idOf(value: string, what: string): number {
  const id = parsePositiveInteger(value, what);
  if (id === undefined) throw new BadRequestException(`Parameter ${what} wajib diisi.`);
  return id;
}

/**
 * Kasus investigasi. `GET` daftar dan detail, `POST` kasus baru (boleh
 * sekaligus dengan subjek, temuan, catatan, dan langkah), `POST /:id/items`
 * menambah item ke kasus yang ada, `PATCH /:id` mengubah judul, ringkasan,
 * status, dan tag. Hapus kasus atau satu subjek, temuan, atau catatan.
 * Semua butuh masuk; kasus milik akun lain dijawab `404`.
 */
@Controller('cases')
@UseGuards(SessionGuard)
export class CasesController {
  constructor(private readonly service: CasesService) {}

  /** Id kasus milik akun ini; selain itu `404`. */
  private async owned(account: Account, value: string): Promise<number> {
    const id = idOf(value, 'id');
    await this.service.assertOwned(account.userId, id);
    return id;
  }

  @Get()
  list(@CurrentAccount() account: Account): Promise<CaseSummaryView[]> {
    return this.service.list(account.userId);
  }

  @Get(':id')
  async get(@CurrentAccount() account: Account, @Param('id') id: string): Promise<CaseView> {
    return this.service.get(await this.owned(account, id));
  }

  @Post()
  create(@CurrentAccount() account: Account, @Body() body: unknown): Promise<SaveToCaseResult> {
    return this.service.create(account.userId, parsed(() => parseNewCase(body)));
  }

  @Post(':id/items')
  @HttpCode(200)
  async addItems(@CurrentAccount() account: Account, @Param('id') id: string, @Body() body: unknown): Promise<SaveToCaseResult> {
    return this.service.addItems(await this.owned(account, id), parsed(() => parseItems(body)));
  }

  @Patch(':id')
  async update(@CurrentAccount() account: Account, @Param('id') id: string, @Body() body: unknown): Promise<CaseView> {
    return this.service.update(await this.owned(account, id), parsed(() => parseUpdate(body)));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentAccount() account: Account, @Param('id') id: string): Promise<void> {
    return this.service.remove(await this.owned(account, id));
  }

  @Delete(':id/subjects/:subjectId')
  @HttpCode(204)
  async removeSubject(@CurrentAccount() account: Account, @Param('id') id: string, @Param('subjectId') subjectId: string): Promise<void> {
    return this.service.removeSubject(await this.owned(account, id), idOf(subjectId, 'subjectId'));
  }

  @Delete(':id/findings/:findingKey')
  @HttpCode(204)
  async removeFinding(@CurrentAccount() account: Account, @Param('id') id: string, @Param('findingKey') findingKey: string): Promise<void> {
    return this.service.removeFinding(await this.owned(account, id), findingKey);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(204)
  async removeNote(@CurrentAccount() account: Account, @Param('id') id: string, @Param('noteId') noteId: string): Promise<void> {
    return this.service.removeNote(await this.owned(account, id), idOf(noteId, 'noteId'));
  }
}
