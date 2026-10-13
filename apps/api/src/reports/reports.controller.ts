import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { parsePositiveInteger } from '../common/query-params.js';
import { parseNewReport, parseReportUpdate, ReportInputError } from './report-input.js';
import { ReportsService } from './reports.service.js';
import type { ReportSummaryView, ReportView } from './reports.types.js';

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
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get()
  list(): Promise<ReportSummaryView[]> {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<ReportView> {
    return this.service.get(idOf(id));
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
