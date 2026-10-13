/**
 * Kontrak `/api/risk`: ringkasan penilaian risiko objek (token, wallet,
 * kontrak) per chain. Skor `null` berarti belum bisa dinilai, bukan aman.
 */
import type {
  DangerTraitStatus,
  DataStatus,
  InfoClassification,
  RiskLevel,
  RiskObjectKind,
  RiskSeverity,
} from '../database/schema/enums.js';
import type { FlowLabelView } from '../flows/flow-summary.types.js';

export interface RiskScorePart {
  classification: InfoClassification;
  points: number;
  reasonCount: number;
}

export interface RiskSummaryView {
  status: 'assessed';
  chain: string;
  address: string;
  objectKind: RiskObjectKind;
  /** Nama token, nama label utama, atau address yang dipendekkan. */
  title: string;
  label: FlowLabelView | null;
  assessmentId: string;
  methodology: string;
  score: number | null;
  level: RiskLevel;
  /** Asal poin per jenis informasi; `unexplained` bukan nol berarti sebagian skor tidak dijelaskan alasan. */
  breakdown: { parts: RiskScorePart[]; countedPoints: number; uncounted: number; unexplained: number | null };
  counts: {
    reasons: number;
    warnings: number;
    warningsBySeverity: Record<RiskSeverity, number>;
    traits: Record<DangerTraitStatus, number>;
  };
  /** Tiga alasan terberat, untuk kartu ringkas. */
  topReasons: Array<{ code: string; title: string; severity: RiskSeverity; classification: InfoClassification; points: number | null }>;
  latestWarning: { title: string; severity: RiskSeverity; detectedAt: string } | null;
  snapshot: {
    blockNumber: number;
    fetchedAt: string;
    assessedAt: string;
    sources: string[];
    dataStatus: DataStatus;
    statusReason: string | null;
  };
  /** Ada data tersimpan yang lebih baru dari blok penilaian ini; nilai ulang dengan `?refresh=true`. */
  newerDataAvailable: boolean;
  links: Array<{ kind: 'token' | 'map' | 'flow' | 'multichain'; href: string }>;
}

export interface RiskNoDataView {
  status: 'no_data';
  chain: string;
  address: string;
  objectKind: RiskObjectKind;
  reason: string;
}

export interface MultichainRiskResponse {
  address: string;
  chains: Array<RiskSummaryView | RiskNoDataView>;
  /** Chain dengan skor tertinggi di antara yang sudah dinilai; `null` bila tidak ada skor. */
  highest: { chain: string; score: number; level: RiskLevel } | null;
  caveats: string[];
}
