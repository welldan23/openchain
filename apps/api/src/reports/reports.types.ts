/**
 * Kontrak `/api/reports`: laporan bukti investigasi. Bentuknya mengikuti
 * frontend (`InvestigationReport`, `ReportSummary`); klasifikasi memakai
 * istilah backend (`verified_fact`, `derived_metric`, …).
 */
import type { CaseEvidenceView, CaseSnapshotView } from '../cases/cases.types.js';
import type { CaseSubjectKind, InfoClassification, RiskLevel, RiskObjectKind, RiskSeverity, ReportStatus } from '../database/schema/enums.js';

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
  /** Asal klaim yang disusun otomatis (temuan kasus atau penilaian risiko); `null` bila ditulis sendiri. */
  sourceKey: string | null;
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
  | { kind: 'entity'; id: string; subject: ReportEntityView; sourceKey: string | null };

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

/** Kandidat isi laporan dari kasus sumber dan penilaian risiko entitasnya. */
export interface ReportPickerResponse {
  reportId: string;
  status: ReportStatus;
  source: { caseId: string; title: string } | null;
  /** Subjek kasus sumber, untuk blok entitas. */
  subjects: Array<{ key: string; subject: ReportEntityView; inReport: boolean }>;
  /** Temuan kasus sumber. */
  findings: Array<{
    key: string;
    title: string;
    detail: string;
    classification: InfoClassification;
    inReport: boolean;
    evidenceCount: number;
    storedCount: number;
  }>;
  /** Entitas (subjek kasus dan blok entitas laporan) beserta temuan penilaian risikonya per chain. */
  analyzed: Array<{
    subjectKey: string;
    title: string;
    chain: string | null;
    address: string;
    status: 'assessed' | 'no_data';
    /** Kenapa belum ada penilaian; `null` bila sudah dinilai. */
    reason: string | null;
    objectKind: RiskObjectKind | null;
    score: number | null;
    level: RiskLevel | null;
    methodology: string | null;
    findings: Array<{
      key: string;
      kind: 'reason' | 'warning';
      code: string;
      title: string;
      severity: RiskSeverity;
      classification: InfoClassification;
      points: number | null;
      inReport: boolean;
      evidenceCount: number;
      storedCount: number;
    }>;
  }>;
  caveats: string[];
}

export interface ReportComposeResult {
  report: ReportView;
  addedSubjects: number;
  addedFindings: number;
  /** Id blok baru, untuk disorot di layar. */
  addedBlockIds: string[];
  /** Kunci yang dilewati karena sudah ada di laporan. */
  skipped: string[];
}
