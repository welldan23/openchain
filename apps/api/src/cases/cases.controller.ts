import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { parsePositiveInteger } from '../common/query-params.js';
import { CaseInputError, parseItems, parseNewCase, parseUpdate } from './case-input.js';
import { CasesService } from './cases.service.js';
import type { CaseSummaryView, CaseView, SaveToCaseResult } from './cases.types.js';

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
 */
@Controller('cases')
export class CasesController {
  constructor(private readonly service: CasesService) {}

  @Get()
  list(): Promise<CaseSummaryView[]> {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<CaseView> {
    return this.service.get(idOf(id, 'id'));
  }

  @Post()
  create(@Body() body: unknown): Promise<SaveToCaseResult> {
    return this.service.create(parsed(() => parseNewCase(body)));
  }

  @Post(':id/items')
  @HttpCode(200)
  addItems(@Param('id') id: string, @Body() body: unknown): Promise<SaveToCaseResult> {
    return this.service.addItems(idOf(id, 'id'), parsed(() => parseItems(body)));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<CaseView> {
    return this.service.update(idOf(id, 'id'), parsed(() => parseUpdate(body)));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(idOf(id, 'id'));
  }

  @Delete(':id/subjects/:subjectId')
  @HttpCode(204)
  removeSubject(@Param('id') id: string, @Param('subjectId') subjectId: string): Promise<void> {
    return this.service.removeSubject(idOf(id, 'id'), idOf(subjectId, 'subjectId'));
  }

  @Delete(':id/findings/:findingKey')
  @HttpCode(204)
  removeFinding(@Param('id') id: string, @Param('findingKey') findingKey: string): Promise<void> {
    return this.service.removeFinding(idOf(id, 'id'), findingKey);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(204)
  removeNote(@Param('id') id: string, @Param('noteId') noteId: string): Promise<void> {
    return this.service.removeNote(idOf(id, 'id'), idOf(noteId, 'noteId'));
  }
}
