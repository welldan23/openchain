/**
 * Kontrak `/api/reports`: laporan bukti investigasi. Bentuknya mengikuti
 * frontend (`InvestigationReport`, `ReportSummary`); klasifikasi memakai
 * istilah backend (`verified_fact`, `derived_metric`, …).
 */
import type { CaseEvidenceView, CaseMovementView, CaseSnapshotView } from '../cases/cases.types.js';
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
  evidence: ReportEvidenceView[];
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

/** Bukti satu transaksi beserta tautan explorer-nya; `null` bila chain belum punya explorer. */
export type ReportEvidenceView = CaseEvidenceView & { explorerUrl: string | null };

/** Satu hash bukti di laporan: siapa yang mengutipnya, apakah sudah disematkan, dan tangkapan datanya. */
export interface ReportEvidenceEntry {
  chain: string;
  txHash: string;
  /** Rincian transaksinya sudah tersimpan. */
  stored: boolean;
  explorerUrl: string | null;
  /** Rincian dari data tersimpan, dengan tautan explorer tiap pihak; `null` bila belum tersimpan. */
  detail: {
    timestamp: string;
    blockNumber: number;
    movements: Array<CaseMovementView & { fromUrl: string | null; toUrl: string | null }>;
  } | null;
  citedBy: Array<{ blockId: string; title: string }>;
  /** Blok bukti tersemat untuk hash ini, bila ada. */
  embeddedBlockId: string | null;
  /** Data yang dipakai laporan: waktu snapshot, blok chain ini, dan provider. */
  capture: { fetchedAt: string; blockNumber: number | null; sources: string[] };
}

export type ReportEvidenceFilter = 'all' | 'not_embedded' | 'no_detail';

export interface ReportEvidenceResponse {
  reportId: string;
  filter: ReportEvidenceFilter;
  /** Urut waktu transaksi; hash tanpa rincian di akhir sesuai urutan kemunculan. */
  entries: ReportEvidenceEntry[];
  total: number;
  counts: Record<ReportEvidenceFilter, number>;
  caveats: string[];
}

export interface ReportEmbedResult {
  report: ReportView;
  blockId: string;
  /** `false` bila hash itu sudah tersemat sebelumnya. */
  created: boolean;
}

/** Catatan investigasi di laporan beserta klaim yang dibahasnya. */
export interface ReportNoteView {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  sectionId: string;
  sectionTitle: string;
  /** Klaim yang dibahas; `null` bila catatan umum atau klaimnya sudah dihapus. */
  claim: { blockId: string; title: string } | null;
}

export interface ReportNotesResponse {
  reportId: string;
  /** Urut sesuai letaknya di laporan. */
  notes: ReportNoteView[];
  /** Klaim yang bisa dipilih sebagai kaitan catatan, urut sesuai laporan. */
  claimOptions: Array<{ blockId: string; title: string }>;
}

export interface ReportNoteResult {
  report: ReportView;
  note: ReportNoteView;
}

/** Tautan berbagi publik; token mentah tidak pernah ditampilkan lagi setelah dibuat. */
export interface ReportShareLinkView {
  id: string;
  /** Beberapa karakter awal token, untuk mengenali tautan. */
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  status: 'active' | 'expired' | 'revoked';
}

export interface ReportShareCreated extends ReportShareLinkView {
  /** Token mentah; hanya ditunjukkan sekali ini. */
  token: string;
  /** Halaman publik di frontend. */
  path: string;
  /** Endpoint publik di API (tanpa awalan `/api`). */
  apiPath: string;
}

export interface ReportSharesResponse {
  reportId: string;
  /** Laporan bisa dibagikan publik (sudah final). */
  shareable: boolean;
  /** Kenapa belum bisa atau tautannya tidak tampil; `null` bila bisa. */
  reason: string | null;
  links: ReportShareLinkView[];
}

/** Laporan untuk pembaca publik: tanpa tautan internal ke kasus dan kunci asal blok. */
export type PublicReportView = Omit<ReportView, 'source'> & {
  source: { title: string } | null;
  share: { createdAt: string; expiresAt: string | null };
};
