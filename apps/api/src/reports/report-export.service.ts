/**
 * Ekspor laporan ke CSV (tabel klaim dan bukti) atau PDF (dokumen lengkap
 * dengan tautan explorer). Isinya dari laporan tersimpan saat ini; laporan
 * yang masih punya blocker ditandai DRAF.
 */
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { FlowsRepository } from '../flows/flows.repository.js';
import { reportEvidenceEntries } from './report-evidence.js';
import { exportFileName, REPORT_EXPORT_FORMATS, reportToCsv, reportToPdf, type ReportExportFormat } from './report-export.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';

export interface ReportExportFile {
  fileName: string;
  mime: string;
  content: Buffer;
}

@Injectable()
export class ReportExportService {
  constructor(
    private readonly reports: ReportsService,
    private readonly repository: ReportsRepository,
    private readonly flows: FlowsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async export(id: number, format: ReportExportFormat): Promise<ReportExportFile> {
    const report = await this.reports.get(id);
    const [chains, classificationLabels] = await Promise.all([this.flows.listChains(), this.repository.classificationLabels()]);
    const generatedAt = this.clock.now();
    const context = { classificationLabels, evidence: reportEvidenceEntries(report, new Map(chains.map((chain) => [chain.id, chain]))), generatedAt };
    const content = format === 'csv' ? Buffer.from(reportToCsv(report, context), 'utf8') : reportToPdf(report, context);
    return { fileName: exportFileName(report.title, format, generatedAt), mime: REPORT_EXPORT_FORMATS[format].mime, content };
  }
}
