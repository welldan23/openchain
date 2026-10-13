import { BadRequestException, Controller, Get, Header, Param, Query, StreamableFile } from '@nestjs/common';
import { REPORT_EXPORT_FORMATS, type ReportExportFormat } from './report-export.js';
import { ReportShareService } from './report-share.service.js';
import type { PublicReportView } from './reports.types.js';

/**
 * Laporan untuk pembaca publik lewat tautan berbagi: hanya-baca, hanya
 * laporan final, tanpa tautan internal ke kasus. Tidak disimpan cache dan
 * tidak diindeks mesin pencari.
 */
@Controller('public/reports')
export class PublicReportsController {
  constructor(private readonly shares: ReportShareService) {}

  @Get(':token')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  view(@Param('token') token: string): Promise<PublicReportView> {
    return this.shares.view(token);
  }

  @Get(':token/export')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  async export(@Param('token') token: string, @Query('format') format?: string): Promise<StreamableFile> {
    if (format === undefined || !Object.hasOwn(REPORT_EXPORT_FORMATS, format)) {
      throw new BadRequestException(`Parameter format harus salah satu dari: ${Object.keys(REPORT_EXPORT_FORMATS).join(', ')}.`);
    }
    const file = await this.shares.export(token, format as ReportExportFormat);
    return new StreamableFile(file.content, { type: file.mime, disposition: `attachment; filename="${file.fileName}"`, length: file.content.length });
  }
}
