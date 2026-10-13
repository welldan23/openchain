/**
 * Aturan skoring risiko objek (metode `openchain-risk-v1`), murni tanpa
 * database. Masukannya fakta yang sudah tersimpan; keluarannya alasan dengan
 * poin, peringatan dini, dan hasil pemantauan ciri berbahaya.
 *
 * Prinsip:
 * - Skor = jumlah poin alasan (maksimal 100). Tanpa data yang bisa dinilai,
 *   skor kosong (`unknown`), bukan nol.
 * - Asumsi tidak pernah menyumbang poin.
 * - Ciri yang tidak bisa dicek ditulis `unknown` beserta alasannya, bukan
 *   dianggap aman.
 */
import type {
  CheckStatus,
  ClusterLabel,
  ConfidenceLevel,
  DangerTrait,
  DangerTraitStatus,
  InfoClassification,
  RiskObjectKind,
  RiskSeverity,
} from '../database/schema/enums.js';
import { riskLevelFromScore, weakestClassification, type RiskLevel } from '../snapshots/classification.js';

export const RISK_METHODOLOGY = 'openchain-risk-v1';
/** Pola yang terjadi dalam rentang ini sebelum data diambil masuk peringatan dini. */
export const WARNING_WINDOW_MS = 7 * 24 * 3_600_000;
/** Batas hash bukti per alasan supaya respons tetap ringkas. */
export const MAX_EVIDENCE_PER_ITEM = 10;

export interface EvidenceRef {
  chainId: string;
  txHash: string;
  evidenceId: number | null;
}

export interface CheckFact {
  code: string;
  status: CheckStatus;
  value: string;
  classification: InfoClassification | null;
  evidence: EvidenceRef[];
}

export interface ClusterFact {
  key: string;
  name: string;
  labels: ClusterLabel[];
  confidence: ConfidenceLevel;
  memberCount: number;
  evidence: EvidenceRef[];
}

export interface TokenFacts {
  checks: CheckFact[];
  /** Persen supply 10 holder teratas; `null` bila belum dihitung. */
  top10Pct: number | null;
  /** Kelompok di peta terbaru token; `null` bila peta belum dibangun. */
  clusters: ClusterFact[] | null;
}

export interface MovementFact {
  kind: 'exchange_deposit' | 'bridge_out';
  classification: InfoClassification;
  at: Date;
  evidence: EvidenceRef;
}

export interface WalletFacts {
  movements: MovementFact[];
  /** Kelompok terkoordinasi yang didanai wallet ini; `null` bila tidak ada peta yang memuatnya. */
  fundedClusters: ClusterFact[] | null;
  /** Label dugaan bot dari OpenChain. */
  botLabels: Array<{ name: string | null; confidence: number | null }>;
}

export interface ReasonDraft {
  code: string;
  title: string;
  description: string;
  severity: RiskSeverity;
  classification: InfoClassification;
  points: number | null;
  evidence: EvidenceRef[];
}

export interface WarningDraft {
  code: string;
  trait: DangerTrait;
  title: string;
  description: string;
  severity: RiskSeverity;
  classification: InfoClassification;
  detectedAt: Date;
  evidence: EvidenceRef[];
}

export interface TraitDraft {
  trait: DangerTrait;
  status: DangerTraitStatus;
  note: string | null;
  reasonCode: string | null;
  warningCode: string | null;
}

export interface AssessmentDraft {
  objectKind: RiskObjectKind;
  score: number | null;
  level: RiskLevel;
  reasons: ReasonDraft[];
  warnings: WarningDraft[];
  traits: TraitDraft[];
  /** Kenapa skor kosong; `null` bila sudah dinilai. */
  unratedReason: string | null;
}

/* --------------------------------- Token ---------------------------------- */

interface CheckRule {
  trait: DangerTrait | null;
  title: string;
  why: string;
  fail: { points: number; severity: RiskSeverity };
  warn: { points: number; severity: RiskSeverity };
}

/** Kode cek kontrak yang dinilai. Kode lain diabaikan, tidak ditebak artinya. */
export const CHECK_RULES: Record<string, CheckRule> = {
  honeypot: {
    trait: 'sell_blocked',
    title: 'Token berisiko tidak bisa dijual',
    why: 'Pembeli bisa terjebak bila token tidak bisa dijual kembali.',
    fail: { points: 40, severity: 'critical' },
    warn: { points: 15, severity: 'high' },
  },
  tax: {
    trait: 'tax_change',
    title: 'Pajak transaksi berisiko',
    why: 'Pajak tinggi atau yang bisa diubah owner bisa membuat token sulit dijual.',
    fail: { points: 20, severity: 'high' },
    warn: { points: 10, severity: 'medium' },
  },
  mint: {
    trait: 'mint_active',
    title: 'Supply masih bisa dicetak',
    why: 'Supply baru bisa dicetak kapan saja dan menekan harga.',
    fail: { points: 20, severity: 'high' },
    warn: { points: 12, severity: 'medium' },
  },
  'liquidity-lock': {
    trait: 'liquidity_unlocked',
    title: 'Likuiditas tidak terkunci',
    why: 'Pemegang LP bisa menarik likuiditas kapan saja.',
    fail: { points: 20, severity: 'high' },
    warn: { points: 10, severity: 'medium' },
  },
  proxy: {
    trait: 'upgradeable',
    title: 'Kode kontrak bisa diganti',
    why: 'Kontrak proxy bisa diganti logikanya setelah orang membeli.',
    fail: { points: 15, severity: 'high' },
    warn: { points: 10, severity: 'medium' },
  },
  blacklist: {
    trait: 'blacklist',
    title: 'Address bisa diblokir',
    why: 'Owner bisa memblokir address tertentu agar tidak bisa transfer.',
    fail: { points: 12, severity: 'high' },
    warn: { points: 8, severity: 'medium' },
  },
  pause: {
    trait: null,
    title: 'Transfer bisa dihentikan',
    why: 'Owner bisa menghentikan semua transfer token.',
    fail: { points: 10, severity: 'high' },
    warn: { points: 6, severity: 'medium' },
  },
  ownership: {
    trait: null,
    title: 'Owner kontrak masih aktif',
    why: 'Owner yang aktif masih bisa memakai fungsi khusus owner.',
    fail: { points: 8, severity: 'medium' },
    warn: { points: 5, severity: 'low' },
  },
  verified: {
    trait: null,
    title: 'Kode kontrak belum terverifikasi',
    why: 'Tanpa kode terverifikasi, perilaku kontrak tidak bisa dicek.',
    fail: { points: 10, severity: 'medium' },
    warn: { points: 6, severity: 'low' },
  },
};

const COORDINATED_LABELS: ReadonlySet<ClusterLabel> = new Set(['common_funding', 'coordinated_execution', 'bundled_or_sniper_activity']);
const CLUSTER_POINTS: Record<ConfidenceLevel, { points: number; severity: RiskSeverity }> = {
  high: { points: 15, severity: 'high' },
  medium: { points: 10, severity: 'medium' },
  low: { points: 5, severity: 'low' },
};
const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { high: 0, medium: 1, low: 2 };

function capEvidence(items: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = `${item.chainId}:${item.txHash.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_EVIDENCE_PER_ITEM);
}

function trait(traitName: DangerTrait, status: DangerTraitStatus, note: string | null, refs: { reasonCode?: string; warningCode?: string } = {}): TraitDraft {
  return { trait: traitName, status, note, reasonCode: refs.reasonCode ?? null, warningCode: refs.warningCode ?? null };
}

function finalize(objectKind: RiskObjectKind, reasons: ReasonDraft[], warnings: WarningDraft[], traits: TraitDraft[], unratedReason: string | null): AssessmentDraft {
  const score = unratedReason === null ? Math.min(100, reasons.reduce((total, reason) => total + (reason.points ?? 0), 0)) : null;
  // Alasan terberat dulu supaya urutan tampil konsisten.
  const order: RiskSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
  const sorted = [...reasons].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || (b.points ?? -1) - (a.points ?? -1) || a.code.localeCompare(b.code));
  return { objectKind, score, level: riskLevelFromScore(score), reasons: sorted, warnings, traits, unratedReason };
}

/** Kelompok terkoordinasi terkuat dari daftar kelompok peta. */
function strongestCoordinated(clusters: ClusterFact[]): { best: ClusterFact; count: number } | null {
  const coordinated = clusters.filter((cluster) => cluster.labels.some((label) => COORDINATED_LABELS.has(label)));
  if (coordinated.length === 0) return null;
  const best = [...coordinated].sort((a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] || b.memberCount - a.memberCount)[0];
  return { best, count: coordinated.length };
}

export function scoreToken(facts: TokenFacts): AssessmentDraft {
  const reasons: ReasonDraft[] = [];
  const traits: TraitDraft[] = [];
  const byCode = new Map(facts.checks.map((check) => [check.code, check]));
  let rated = 0;

  for (const [code, rule] of Object.entries(CHECK_RULES)) {
    const check = byCode.get(code);
    if (check && check.status !== 'unknown') rated += 1;
    if (check && (check.status === 'fail' || check.status === 'warn') && check.classification && check.classification !== 'unavailable') {
      const weight = rule[check.status];
      reasons.push({
        code: `check_${code}`,
        title: rule.title,
        description: `${check.value}. ${rule.why}`,
        severity: weight.severity,
        classification: check.classification,
        points: check.classification === 'assumption' ? null : weight.points,
        evidence: capEvidence(check.evidence),
      });
      if (rule.trait) traits.push(trait(rule.trait, 'detected', null, { reasonCode: `check_${code}` }));
    } else if (rule.trait) {
      if (!check) traits.push(trait(rule.trait, 'unknown', 'Belum ada hasil pemeriksaan kontrak untuk ciri ini.'));
      else if (check.status === 'pass') traits.push(trait(rule.trait, 'clear', `${check.value}.`));
      else traits.push(trait(rule.trait, 'unknown', `Belum bisa diperiksa: ${check.value}.`));
    }
  }

  if (facts.top10Pct === null) {
    traits.push(trait('holder_concentration', 'unknown', 'Konsentrasi holder belum dihitung.'));
  } else {
    rated += 1;
    const pct = Math.round(facts.top10Pct * 10) / 10;
    if (facts.top10Pct >= 50) {
      const heavy = facts.top10Pct >= 80;
      reasons.push({
        code: 'holder_concentration',
        title: `10 holder teratas memegang ${pct}% supply`,
        description: 'Dihitung dari saldo holder pada blok snapshot. Segelintir wallet bisa menekan harga bila menjual bersamaan; sebagian bisa saja pool atau kontrak.',
        severity: heavy ? 'high' : 'medium',
        classification: 'derived_metric',
        points: heavy ? 15 : 8,
        evidence: [],
      });
      traits.push(trait('holder_concentration', 'detected', null, { reasonCode: 'holder_concentration' }));
    } else {
      traits.push(trait('holder_concentration', 'clear', `10 holder teratas memegang ${pct}% supply.`));
    }
  }

  if (facts.clusters === null) {
    traits.push(trait('bundled_launch', 'unknown', 'Peta hubungan holder token ini belum dibangun.'));
  } else {
    rated += 1;
    const found = strongestCoordinated(facts.clusters);
    if (found) {
      const weight = CLUSTER_POINTS[found.best.confidence];
      reasons.push({
        code: 'bundled_launch',
        title: `${found.count} kelompok holder terlihat terkoordinasi`,
        description: `Kelompok terkuat "${found.best.name}" berisi ${found.best.memberCount} wallet dengan keyakinan ${found.best.confidence}. Dugaan berbasis pola pendanaan dan waktu transaksi, bukan bukti satu pengendali.`,
        severity: weight.severity,
        classification: 'heuristic',
        points: weight.points,
        evidence: capEvidence(found.best.evidence),
      });
      traits.push(trait('bundled_launch', 'detected', null, { reasonCode: 'bundled_launch' }));
    } else {
      traits.push(trait('bundled_launch', 'clear', 'Peta hubungan tidak menemukan kelompok holder yang terkoordinasi.'));
    }
  }

  traits.push(trait('liquidity_pulled', 'unknown', 'Penarikan likuiditas belum dipantau oleh OpenChain.'));
  return finalize('token', reasons, [], traits, rated === 0 ? 'Belum ada hasil pemeriksaan kontrak, konsentrasi holder, atau peta hubungan yang bisa dinilai.' : null);
}

/* --------------------------------- Wallet --------------------------------- */

function movementRule(
  kind: MovementFact['kind'],
): { trait: DangerTrait; code: string; title: (n: number) => string; why: string; warningTitle: string; severity: RiskSeverity; points: number } {
  return kind === 'exchange_deposit'
    ? {
        trait: 'exchange_cashout',
        code: 'exchange_cashout',
        title: (n) => `${n} setoran ke exchange`,
        why: 'Dana yang masuk exchange tidak bisa dilacak lagi on-chain. Wajar untuk banyak wallet, tapi memutus jejak bila dipakai untuk mencairkan hasil.',
        warningTitle: 'Setoran ke exchange baru-baru ini',
        severity: 'low',
        points: 5,
      }
    : {
        trait: 'bridge_hop',
        code: 'bridge_hop',
        title: (n) => `${n} kiriman lewat bridge ke chain lain`,
        why: 'Dana dipindah ke chain lain, jadi jejaknya perlu dilanjutkan di sana. Kontrak bridge dikenali dari labelnya.',
        warningTitle: 'Kiriman bridge baru-baru ini',
        severity: 'low',
        points: 5,
      };
}

export function scoreWallet(facts: WalletFacts, dataAt: Date): AssessmentDraft {
  const reasons: ReasonDraft[] = [];
  const warnings: WarningDraft[] = [];
  const traits: TraitDraft[] = [];

  for (const kind of ['exchange_deposit', 'bridge_out'] as const) {
    const rule = movementRule(kind);
    const moves = facts.movements.filter((move) => move.kind === kind).sort((a, b) => b.at.getTime() - a.at.getTime());
    if (moves.length === 0) {
      traits.push(trait(rule.trait, 'clear', 'Tidak ada di rentang yang sudah dipindai.'));
      continue;
    }
    const classification = weakestClassification(moves.map((move) => move.classification));
    reasons.push({
      code: rule.code,
      title: rule.title(moves.length),
      description: rule.why,
      severity: rule.severity,
      classification,
      points: classification === 'assumption' ? null : rule.points,
      evidence: capEvidence(moves.map((move) => move.evidence)),
    });
    const recent = moves.filter((move) => dataAt.getTime() - move.at.getTime() <= WARNING_WINDOW_MS && move.at <= dataAt);
    if (recent.length > 0) {
      warnings.push({
        code: `recent_${rule.code}`,
        trait: rule.trait,
        title: rule.warningTitle,
        description: `${recent.length} kejadian dalam 7 hari sebelum data diambil. ${rule.why}`,
        severity: rule.severity,
        classification: weakestClassification(recent.map((move) => move.classification)),
        detectedAt: recent[0].at,
        evidence: capEvidence(recent.map((move) => move.evidence)),
      });
      traits.push(trait(rule.trait, 'detected', null, { warningCode: `recent_${rule.code}` }));
    } else {
      traits.push(trait(rule.trait, 'detected', null, { reasonCode: rule.code }));
    }
  }

  if (facts.fundedClusters === null) {
    traits.push(trait('bundled_launch', 'unknown', 'Belum ada peta hubungan yang memuat wallet ini sebagai pendana.'));
  } else {
    const found = strongestCoordinated(facts.fundedClusters);
    if (found) {
      const weight = CLUSTER_POINTS[found.best.confidence];
      reasons.push({
        code: 'funds_coordinated_group',
        title: `Mendanai ${found.count} kelompok wallet yang terlihat terkoordinasi`,
        description: `Kelompok "${found.best.name}" (${found.best.memberCount} wallet, keyakinan ${found.best.confidence}) didanai wallet ini. Dugaan berbasis pola, bukan bukti satu pengendali.`,
        severity: weight.severity,
        classification: 'heuristic',
        points: weight.points,
        evidence: capEvidence(found.best.evidence),
      });
      traits.push(trait('bundled_launch', 'detected', null, { reasonCode: 'funds_coordinated_group' }));
    } else {
      traits.push(trait('bundled_launch', 'clear', 'Peta hubungan yang memuat wallet ini tidak menemukan kelompok terkoordinasi.'));
    }
  }

  if (facts.botLabels.length > 0) {
    const [label] = facts.botLabels;
    reasons.push({
      code: 'bot_label',
      title: 'Dilabeli kemungkinan bot',
      description: `Label dugaan OpenChain${label.name ? ` "${label.name}"` : ''}${label.confidence !== null ? ` dengan keyakinan ${Math.round(label.confidence * 100)}%` : ''}. Pola transaksinya seragam seperti otomatis.`,
      severity: 'low',
      classification: 'heuristic',
      points: 5,
      evidence: [],
    });
  }

  traits.push(trait('fresh_wallet_funding', 'unknown', 'Pendanaan ke wallet baru belum dipantau oleh OpenChain.'));
  return finalize('wallet', reasons, warnings, traits, null);
}

/* -------------------------------- Kontrak --------------------------------- */

/** Kontrak selain token belum punya pemeriksaan, jadi belum bisa diberi skor. */
export function scoreContract(): AssessmentDraft {
  const note = 'Pemeriksaan untuk kontrak selain token belum tersedia.';
  return finalize(
    'contract',
    [],
    [],
    [trait('upgradeable', 'unknown', note), trait('liquidity_unlocked', 'unknown', note), trait('liquidity_pulled', 'unknown', note)],
    'Belum ada pemeriksaan untuk kontrak selain token, jadi skornya belum bisa dihitung.',
  );
}
