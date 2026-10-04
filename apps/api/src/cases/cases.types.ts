/**
 * Kontrak `/api/cases`: kasus investigasi beserta subjek, temuan, bukti hash
 * transaksi, langkah, catatan, dan snapshot data supaya bisa direproduksi.
 */
import type { CaseStatus, CaseSubjectKind, DataStatus, InfoClassification, InvestigationKind } from '../database/schema/enums.js';
import type { FlowAsset, FlowLabelView } from '../flows/flow-summary.types.js';

export interface CaseSubjectView {
  id: string;
  kind: CaseSubjectKind;
  chain: string | null;
  address: string;
  title: string;
  /** Label utama address (eksternal dulu); `null` bila belum ada. */
  label: FlowLabelView | null;
  href: string;
}

export interface CaseFindingView {
  /** Id temuan dari sumbernya, mis. id kelompok di peta. */
  id: string;
  title: string;
  detail: string;
  classification: InfoClassification;
  evidence: Array<{ chain: string; txHash: string }>;
}

export interface CaseMovementView {
  from: string;
  to: string;
  asset: FlowAsset;
  amountRaw: string;
  amount: string | null;
  amountUsd: number | null;
}

/** Bukti satu transaksi; `stored: false` bila transaksinya belum ada di data tersimpan. */
export interface CaseEvidenceView {
  chain: string;
  txHash: string;
  stored: boolean;
  timestamp: string | null;
  blockNumber: number | null;
  movements: CaseMovementView[];
}

export interface CaseStepView {
  kind: InvestigationKind;
  title: string;
  chain: string | null;
  href: string;
  openedAt: string;
}

export interface CaseNoteView {
  id: string;
  body: string;
  createdAt: string;
}

export interface CaseSnapshotView {
  fetchedAt: string;
  blocks: Array<{ chain: string; blockNumber: number }>;
  sources: string[];
  dataStatus: DataStatus;
  statusReason: string | null;
}

export interface CaseView {
  id: string;
  title: string;
  summary: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  subjects: CaseSubjectView[];
  findings: CaseFindingView[];
  evidence: CaseEvidenceView[];
  /** Halaman investigasi yang dibuka untuk kasus ini, terbaru dulu. */
  steps: CaseStepView[];
  notes: CaseNoteView[];
  snapshot: CaseSnapshotView;
}

export interface CaseSummaryView {
  id: string;
  title: string;
  summary: string;
  status: CaseStatus;
  updatedAt: string;
  tags: string[];
  chains: string[];
  subjectCount: number;
  findingCount: number;
  evidenceCount: number;
  noteCount: number;
  dataStatus: DataStatus;
}

/** Hasil `POST /api/cases` dan `POST /api/cases/:id/items`. */
export interface SaveToCaseResult {
  caseId: string;
  caseTitle: string;
  created: boolean;
  subjectAdded: boolean;
  addedFindings: number;
  skippedFindings: number;
  noteAdded: boolean;
  stepAdded: boolean;
}
