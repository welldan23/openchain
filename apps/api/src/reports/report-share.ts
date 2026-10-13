/**
 * Tautan berbagi publik laporan, murni. Token acak 32 karakter (base64url,
 * 192 bit); yang disimpan hanya hash SHA-256-nya. Tampilan publik membuang
 * tautan internal (id dan halaman kasus) dan kunci asal blok.
 */
import { createHash } from 'node:crypto';
import type { PublicReportView, ReportBlockView, ReportShareLinkView, ReportView } from './reports.types.js';

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
export const TOKEN_PREFIX_LENGTH = 6;
export const MAX_SHARE_DAYS = 365;
export const NOT_FINAL_REASON = 'Hanya laporan final yang bisa dibagikan publik. Finalkan laporan dulu supaya pembaca hanya melihat isi yang sudah lolos cek kesiapan.';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const publicPath = (token: string) => `/publik/laporan/${token}`;
export const publicApiPath = (token: string) => `/public/reports/${token}`;

type LinkRow = { id: number; tokenPrefix: string; createdAt: Date; expiresAt: Date | null; revokedAt: Date | null; lastViewedAt: Date | null; viewCount: number };

export function linkStatus(link: Pick<LinkRow, 'expiresAt' | 'revokedAt'>, now: Date): ReportShareLinkView['status'] {
  if (link.revokedAt !== null) return 'revoked';
  if (link.expiresAt !== null && link.expiresAt <= now) return 'expired';
  return 'active';
}

export function toLinkView(link: LinkRow, now: Date): ReportShareLinkView {
  return {
    id: String(link.id),
    prefix: link.tokenPrefix,
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    lastViewedAt: link.lastViewedAt?.toISOString() ?? null,
    viewCount: link.viewCount,
    status: linkStatus(link, now),
  };
}

function publicBlock(block: ReportBlockView): ReportBlockView {
  if (block.kind === 'claim') return { ...block, claim: { ...block.claim, sourceKey: null } };
  if (block.kind === 'entity') return { ...block, sourceKey: null };
  return block;
}

export function toPublicView(report: ReportView, link: Pick<LinkRow, 'createdAt' | 'expiresAt'>): PublicReportView {
  return {
    ...report,
    source: report.source ? { title: report.source.title } : null,
    sections: report.sections.map((section) => ({ ...section, blocks: section.blocks.map(publicBlock) })),
    share: { createdAt: link.createdAt.toISOString(), expiresAt: link.expiresAt?.toISOString() ?? null },
  };
}
