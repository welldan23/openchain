/**
 * Kontrak respons `GET /api/tokens/:chain/:address/evidence`.
 */
import type { DataStatus, InfoClassification } from '../database/schema/enums.js';
import type { EvidenceView } from './evidence.view.js';
import type { SnapshotHeader } from './token-summary.types.js';

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface FindingView {
  /** Kode stabil temuan; dipakai untuk filter `?finding=`. */
  code: string;
  title: string;
  description: string;
  severity: RiskSeverity;
  classification: InfoClassification;
  /** Jumlah bukti yang mendukung temuan ini (sebelum filter). */
  evidenceCount: number;
}

export interface EvidenceItemView extends EvidenceView {
  /** Kode temuan risiko yang didukung bukti ini. */
  relatedFindings: string[];
  /** Kode pemeriksaan kontrak yang didukung bukti ini. */
  relatedChecks: string[];
}

export interface EvidenceFilter {
  finding: string | null;
  classification: InfoClassification | null;
}

export interface EvidenceListResponse {
  chain: { id: string; name: string; supportStatus: 'planned' | 'experimental' | 'validated' };
  token: { address: string };
  snapshot: SnapshotHeader | null;
  dataStatus: DataStatus;
  filter: EvidenceFilter;
  /** Semua temuan pada snapshot, urut dari yang paling parah. */
  findings: FindingView[];
  /** Bukti yang lolos filter, terbaru lebih dulu. */
  evidence: EvidenceItemView[];
}
