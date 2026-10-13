/**
 * Kontrak `/api/risk`: ringkasan penilaian risiko objek (token, wallet,
 * kontrak) per chain. Skor `null` berarti belum bisa dinilai, bukan aman.
 */
import type {
  DangerTrait,
  DangerTraitStatus,
  DataStatus,
  InfoClassification,
  RiskLevel,
  RiskObjectKind,
  RiskSeverity,
} from '../database/schema/enums.js';
import type { FlowLabelView } from '../flows/flow-summary.types.js';
import type { TransactionEvidenceResponse } from '../flows/transaction-evidence.types.js';
import type { EvidenceView } from '../tokens/evidence.view.js';

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

/** Satu temuan risiko: alasan penilaian (berpoin) atau peringatan dini. */
export interface RiskFindingView {
  /** Kode stabil temuan, unik dalam satu penilaian per jenis. */
  id: string;
  kind: 'reason' | 'warning';
  title: string;
  description: string;
  severity: RiskSeverity;
  classification: InfoClassification;
  /** Nama dan arti jenis informasi, dari tabel `info_classification_labels`. */
  classificationInfo: { name: string; description: string };
  /** Poin ke skor; `null` bila tidak dihitung (asumsi) atau peringatan. */
  points: number | null;
  trait: DangerTrait | null;
  /** Waktu pola terdeteksi, untuk peringatan. */
  detectedAt: string | null;
  evidence: Array<{ chain: string; txHash: string; stored: boolean; explorerUrl: string | null }>;
}

export interface RiskTraitView {
  trait: DangerTrait;
  status: DangerTraitStatus;
  note: string | null;
  /** Temuan yang menjadi dasar ciri terdeteksi. */
  finding: { kind: 'reason' | 'warning'; id: string } | null;
}

export interface RiskFindingsResponse {
  chain: string;
  address: string;
  objectKind: RiskObjectKind;
  assessmentId: string;
  methodology: string;
  score: number | null;
  level: RiskLevel;
  filters: { classification: InfoClassification[]; severity: RiskSeverity[] };
  /** Temuan setelah disaring, terberat dulu. */
  findings: RiskFindingView[];
  total: number;
  /** Pilihan saringan beserta jumlahnya; jumlah dihitung dengan saringan lain tetap berlaku. */
  facets: {
    classification: Array<{ classification: InfoClassification; name: string; count: number }>;
    severity: Array<{ severity: RiskSeverity; count: number }>;
  };
  traits: RiskTraitView[];
  caveats: string[];
}

/** Satu hash bukti beserta isi transaksinya dari data tersimpan. */
export interface RiskEvidenceDetail {
  chain: string;
  txHash: string;
  /** `false` bila transaksinya belum tersimpan; isinya tidak dikarang, buka di explorer. */
  stored: boolean;
  explorerUrl: string | null;
  /** Catatan bukti yang menjelaskan kenapa hash ini dipakai, bila tersimpan. */
  record: EvidenceView | null;
  /** Isi transaksi: perpindahan dana dengan label pihaknya; `null` bila belum tersimpan. */
  transaction: Pick<TransactionEvidenceResponse, 'blockNumber' | 'timestamp' | 'transaction' | 'movements' | 'sources'> | null;
}

/** Rincian satu alasan penilaian atau peringatan dini, untuk laci "alasan & bukti". */
export interface RiskFindingDetailResponse {
  chain: string;
  address: string;
  objectKind: RiskObjectKind;
  assessmentId: string;
  methodology: string;
  score: number | null;
  level: RiskLevel;
  finding: Omit<RiskFindingView, 'evidence'>;
  /**
   * Porsi poin temuan ini dari total poin yang dihitung, dalam persen (satu
   * desimal); `null` bila temuan tidak berpoin atau belum ada poin dihitung.
   */
  shareOfCountedPoints: number | null;
  countedPoints: number;
  /** Ciri berbahaya yang dasarnya temuan ini. */
  traits: RiskTraitView[];
  evidence: RiskEvidenceDetail[];
  /** Provider snapshot yang dipakai penilaian. */
  sources: string[];
  /** Temuan sebelum/sesudahnya dalam urutan daftar temuan (terberat dulu). */
  navigation: { previous: { kind: 'reason' | 'warning'; id: string } | null; next: { kind: 'reason' | 'warning'; id: string } | null; position: number; total: number };
  caveats: string[];
}
