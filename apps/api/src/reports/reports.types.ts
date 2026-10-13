/**
 * Kontrak `/api/reports`: laporan bukti investigasi. Bentuknya mengikuti
 * frontend (`InvestigationReport`, `ReportSummary`); klasifikasi memakai
 * istilah backend (`verified_fact`, `derived_metric`, …).
 */
import type { CaseEvidenceView, CaseSnapshotView } from '../cases/cases.types.js';
import type { CaseSubjectKind, InfoClassification, ReportStatus } from '../database/schema/enums.js';

export interface ReportClaimView {
  id: string;
  title: string;
  detail: string;
  classification: InfoClassification;
  /** Provider data klaim; `null` ditandai belum siap, tidak ditebak. */
  provider: string | null;
  observedAt: string | null;
  evidence: Array<{ chain: string; txHash: string }>;
  /** Hash bukti saja, sesuai bentuk frontend. */
  evidenceTxHashes: string[];
}

export interface ReportEntityView {
  kind: CaseSubjectKind;
  chain: string | null;
  address: string;
  title: string;
  href: string;
}

export type ReportBlockView =
  | { kind: 'paragraph'; id: string; text: string }
  | { kind: 'claim'; id: string; claim: ReportClaimView }
  | { kind: 'evidence'; id: string; chain: string; txHash: string; caption: string }
  | { kind: 'note'; id: string; body: string; createdAt: string; editedAt: string | null; claimBlockId: string | null }
  | { kind: 'entity'; id: string; subject: ReportEntityView };

export interface ReportSectionView {
  id: string;
  title: string;
  blocks: ReportBlockView[];
}

export type ReportIssueKind =
  | 'claim_without_provider'
  | 'claim_without_time'
  | 'fact_without_evidence'
  | 'claim_without_evidence'
  | 'evidence_not_stored'
  | 'empty_section'
  | 'snapshot_incomplete';

export interface ReportIssue {
  kind: ReportIssueKind;
  /** `blocker` menghalangi laporan difinalkan; `warning` cukup diperhatikan. */
  level: 'blocker' | 'warning';
  sectionId: string | null;
  blockId: string | null;
  message: string;
}

export interface ReportView {
  id: string;
  title: string;
  summary: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  /** Kasus sumber; `caseId` kosong bila kasusnya sudah dihapus (judulnya tetap disimpan). */
  source: { caseId: string | null; title: string; href: string | null } | null;
  sections: ReportSectionView[];
  /** Bukti transaksi dari klaim dan bukti tersemat; `stored: false` bila belum tersimpan. */
  evidence: CaseEvidenceView[];
  snapshot: CaseSnapshotView;
  readiness: { ready: boolean; issues: ReportIssue[] };
}

export interface ReportSummaryView {
  id: string;
  title: string;
  summary: string;
  status: ReportStatus;
  updatedAt: string;
  sourceTitle: string | null;
  sectionCount: number;
  claimCount: number;
  evidenceCount: number;
  /** Masalah yang menghalangi laporan difinalkan. */
  blockerCount: number;
}
