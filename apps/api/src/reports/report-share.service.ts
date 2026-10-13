/**
 * Tautan berbagi laporan untuk pembaca publik. Hanya laporan final yang bisa
 * dibagikan dan ditampilkan; laporan yang dibuka lagi untuk direvisi tidak
 * tampil lewat tautannya sampai difinalkan lagi. Token mentah hanya
 * ditunjukkan sekali; yang disimpan hash-nya.
 */
import { randomBytes } from 'node:crypto';
import { ConflictException, GoneException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import type { ReportExportFormat } from './report-export.js';
import { ReportExportService, type ReportExportFile } from './report-export.service.js';
import type { ShareInput } from './report-input.js';
import { hashToken, linkStatus, NOT_FINAL_REASON, publicApiPath, publicPath, toLinkView, toPublicView, TOKEN_PATTERN, TOKEN_PREFIX_LENGTH } from './report-share.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';
import type { PublicReportView, ReportShareCreated, ReportSharesResponse } from './reports.types.js';

const DAY_MS = 86_400_000;

@Injectable()
export class ReportShareService {
  constructor(
    private readonly reports: ReportsService,
    private readonly repository: ReportsRepository,
    private readonly exporter: ReportExportService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(id: number): Promise<ReportSharesResponse> {
    const row = await this.repository.find(id);
    if (!row) throw new NotFoundException(`Laporan ${id} tidak ditemukan.`);
    const now = this.clock.now();
    const shareable = row.status === 'final';
    return {
      reportId: String(id),
      shareable,
      reason: shareable ? null : NOT_FINAL_REASON,
      links: (await this.repository.shareLinks(id)).map((link) => toLinkView(link, now)),
    };
  }

  async create(id: number, input: ShareInput): Promise<ReportShareCreated> {
    const row = await this.repository.find(id);
    if (!row) throw new NotFoundException(`Laporan ${id} tidak ditemukan.`);
    if (row.status !== 'final') throw new ConflictException(NOT_FINAL_REASON);
    const now = this.clock.now();
    const token = randomBytes(24).toString('base64url');
    const link = await this.repository.insertShareLink({
      reportId: id,
      tokenHash: hashToken(token),
      tokenPrefix: token.slice(0, TOKEN_PREFIX_LENGTH),
      createdAt: now,
      expiresAt: input.expiresInDays === null ? null : new Date(now.getTime() + input.expiresInDays * DAY_MS),
    });
    return { ...toLinkView(link, now), token, path: publicPath(token), apiPath: publicApiPath(token) };
  }

  /** Cabut tautan; mencabut ulang tidak mengubah apa-apa. */
  async revoke(id: number, linkId: number): Promise<void> {
    const link = await this.repository.findShareLink(id, linkId);
    if (!link) throw new NotFoundException(`Tautan ${linkId} tidak ada di laporan ini.`);
    if (link.revokedAt === null) await this.repository.revokeShareLink(linkId, this.clock.now());
  }

  async view(token: string): Promise<PublicReportView> {
    const { link } = await this.resolve(token);
    await this.repository.recordShareView(link.id, this.clock.now());
    return toPublicView(await this.reports.get(link.reportId), link);
  }

  async export(token: string, format: ReportExportFormat): Promise<ReportExportFile> {
    const { link } = await this.resolve(token);
    return this.exporter.export(link.reportId, format);
  }

  /** Tautan yang tidak dikenal 404; dicabut, kedaluwarsa, atau laporannya sedang direvisi 410. */
  private async resolve(token: string) {
    const link = TOKEN_PATTERN.test(token) ? await this.repository.findShareLinkByHash(hashToken(token)) : null;
    if (!link) throw new NotFoundException('Tautan laporan tidak ditemukan.');
    const status = linkStatus(link, this.clock.now());
    if (status === 'revoked') throw new GoneException('Tautan laporan ini sudah dicabut pemiliknya.');
    if (status === 'expired') throw new GoneException('Tautan laporan ini sudah kedaluwarsa.');
    const row = await this.repository.find(link.reportId);
    if (!row || row.status !== 'final') throw new GoneException('Laporan ini sedang direvisi dan belum bisa dilihat publik.');
    return { link, row };
  }
}
