/**
 * Deteksi peringatan dini risiko, murni tanpa database. Peringatan adalah pola
 * BARU yang perlu dipantau, jadi dideteksi dari perubahan: snapshot token
 * terbaru dibandingkan snapshot sebelumnya, dan kiriman wallet ke wallet yang
 * belum punya riwayat. Peringatan tidak pernah menambah skor.
 *
 * Prinsip kejujuran:
 * - Perubahan hanya dibandingkan antara dua data yang sama-sama terbaca;
 *   status `unknown` tidak dianggap berubah.
 * - Ciri yang belum bisa dipantau ditulis `unknown` beserta alasannya.
 * - "Wallet baru" hanya disebut bila seluruh riwayat penerima sudah dipindai
 *   lengkap dan tidak ada transaksi sebelum kiriman itu.
 */
import type { CheckStatus, DangerTrait, RiskSeverity } from '../database/schema/enums.js';
import { CHECK_RULES, MAX_EVIDENCE_PER_ITEM, WARNING_WINDOW_MS, type AssessmentDraft, type CheckFact, type EvidenceRef, type TraitDraft, type WarningDraft } from './risk-rules.js';

/** Likuiditas di bawah ini terlalu kecil untuk dibandingkan dengan andal. */
export const MIN_LIQUIDITY_USD = 1_000;
/** Likuiditas tersisa (rasio) yang dianggap turun tajam, dan yang dianggap hampir habis. */
export const LIQUIDITY_DROP_RATIO = 0.5;
export const LIQUIDITY_GONE_RATIO = 0.2;
/** Kenaikan porsi 10 holder teratas (poin persen) yang dianggap melonjak. */
export const CONCENTRATION_JUMP_PCT = 10;

const STATUS_RANK: Record<Exclude<CheckStatus, 'unknown'>, number> = { pass: 0, warn: 1, fail: 2 };

/** Satu snapshot token yang dibandingkan. */
export interface TokenPoint {
  blockNumber: number;
  fetchedAt: Date;
  top10Pct: number | null;
  liquidityUsd: number | null;
  priceUsd: number | null;
  checks: CheckFact[];
}

/** Kiriman native dari wallet ke address lain, beserta riwayat penerimanya. */
export interface FundingFact {
  recipient: string;
  at: Date;
  evidence: EvidenceRef;
  /**
   * `fresh`: seluruh riwayat penerima sudah dipindai dan tidak ada transaksi
   * sebelum kiriman ini. `has_history`: ada transaksi sebelumnya. `unknown`:
   * riwayat penerima belum dipindai lengkap.
   */
  recipientHistory: 'fresh' | 'has_history' | 'unknown';
}

export interface WarningDetection {
  warnings: WarningDraft[];
  /** Ciri yang hasil pantauannya diganti oleh deteksi ini. */
  traits: TraitDraft[];
}

const usd = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;
const pct = (value: number) => `${Math.round(value * 10) / 10}%`;

function traitDraft(trait: DangerTrait, status: TraitDraft['status'], note: string | null, warningCode: string | null = null): TraitDraft {
  return { trait, status, note, reasonCode: null, warningCode };
}

function uniqueEvidence(items: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(`${item.chainId}:${item.txHash}`) && seen.add(`${item.chainId}:${item.txHash}`)).slice(0, MAX_EVIDENCE_PER_ITEM);
}

/* --------------------------------- Token ---------------------------------- */

/** Bandingkan snapshot token terbaru dengan snapshot sebelumnya. */
export function detectTokenWarnings(current: TokenPoint, previous: TokenPoint | null): WarningDetection {
  const warnings: WarningDraft[] = [];
  const traits: TraitDraft[] = [];
  if (!previous) {
    traits.push(traitDraft('liquidity_pulled', 'unknown', 'Butuh dua snapshot token untuk memantau penurunan likuiditas; baru ada satu.'));
    return { warnings, traits };
  }
  const span = `snapshot blok ${previous.blockNumber} → ${current.blockNumber}`;

  // Cek kontrak yang memburuk, atau pajak yang nilainya berubah.
  const before = new Map(previous.checks.map((check) => [check.code, check]));
  for (const check of current.checks) {
    const rule = CHECK_RULES[check.code];
    const old = before.get(check.code);
    if (!rule?.trait || !old || check.status === 'unknown' || old.status === 'unknown') continue;
    if (!check.classification || check.classification === 'unavailable' || check.status === 'pass') continue;
    const worsened = STATUS_RANK[check.status] > STATUS_RANK[old.status];
    const taxChanged = check.code === 'tax' && check.status === old.status && check.value !== old.value;
    if (!worsened && !taxChanged) continue;
    const code = `${worsened ? 'worsened' : 'changed'}_${check.code}`;
    warnings.push({
      code,
      trait: rule.trait,
      title: taxChanged ? 'Nilai pajak transaksi berubah' : `Baru muncul: ${rule.title.charAt(0).toLowerCase()}${rule.title.slice(1)}`,
      description: `Sebelumnya "${old.value}", sekarang "${check.value}" (${span}). ${rule.why}`,
      severity: rule[check.status].severity,
      classification: check.classification,
      detectedAt: current.fetchedAt,
      evidence: uniqueEvidence(check.evidence),
    });
    traits.push(traitDraft(rule.trait, 'detected', null, code));
  }

  // Likuiditas turun tajam antara dua snapshot.
  if (previous.liquidityUsd === null || current.liquidityUsd === null) {
    traits.push(traitDraft('liquidity_pulled', 'unknown', 'Likuiditas salah satu snapshot tidak terbaca, jadi penurunannya belum bisa dibandingkan.'));
  } else if (previous.liquidityUsd < MIN_LIQUIDITY_USD) {
    traits.push(traitDraft('liquidity_pulled', 'unknown', `Likuiditas snapshot sebelumnya hanya ${usd(previous.liquidityUsd)}, terlalu kecil untuk dibandingkan.`));
  } else {
    const ratio = current.liquidityUsd / previous.liquidityUsd;
    if (ratio <= LIQUIDITY_DROP_RATIO) {
      const priceNote =
        previous.priceUsd !== null && current.priceUsd !== null && previous.priceUsd > 0
          ? ` Harga token berubah ${pct((current.priceUsd / previous.priceUsd - 1) * 100)} di rentang yang sama.`
          : '';
      warnings.push({
        code: 'liquidity_drop',
        trait: 'liquidity_pulled',
        title: `Likuiditas turun ${pct((1 - ratio) * 100)}`,
        description: `Likuiditas pool turun dari ${usd(previous.liquidityUsd)} ke ${usd(current.liquidityUsd)} (${span}).${priceNote} Bisa karena likuiditas ditarik atau harga jatuh; cek transaksi pool sebelum menyimpulkan.`,
        severity: ratio <= LIQUIDITY_GONE_RATIO ? 'high' : 'medium',
        classification: 'derived_metric',
        detectedAt: current.fetchedAt,
        evidence: [],
      });
      traits.push(traitDraft('liquidity_pulled', 'detected', null, 'liquidity_drop'));
    } else {
      traits.push(
        traitDraft(
          'liquidity_pulled',
          'unknown',
          `Tidak ada penurunan tajam (${usd(previous.liquidityUsd)} → ${usd(current.liquidityUsd)}, ${span}), tapi penarikan di antara kedua snapshot belum bisa dipastikan.`,
        ),
      );
    }
  }

  // Porsi 10 holder teratas melonjak.
  if (previous.top10Pct !== null && current.top10Pct !== null && current.top10Pct - previous.top10Pct >= CONCENTRATION_JUMP_PCT) {
    warnings.push({
      code: 'concentration_rising',
      trait: 'holder_concentration',
      title: `Porsi 10 holder teratas naik ${pct(current.top10Pct - previous.top10Pct)}`,
      description: `Dari ${pct(previous.top10Pct)} ke ${pct(current.top10Pct)} supply (${span}). Supply makin terkumpul di segelintir wallet; sebagian bisa saja pool atau kontrak.`,
      severity: 'medium',
      classification: 'derived_metric',
      detectedAt: current.fetchedAt,
      evidence: [],
    });
    traits.push(traitDraft('holder_concentration', 'detected', null, 'concentration_rising'));
  }
  return { warnings, traits };
}

/* --------------------------------- Wallet --------------------------------- */

/** Kiriman ke wallet yang belum punya riwayat; yang terjadi dalam 7 hari sebelum data diambil jadi peringatan. */
export function detectWalletWarnings(fundings: FundingFact[], dataAt: Date): WarningDetection {
  const trait = 'fresh_wallet_funding';
  if (fundings.length === 0) return { warnings: [], traits: [traitDraft(trait, 'clear', 'Tidak ada kiriman native ke wallet lain di rentang yang sudah dipindai.')] };

  const fresh = fundings.filter((item) => item.recipientHistory === 'fresh').sort((a, b) => b.at.getTime() - a.at.getTime());
  const unknown = new Set(fundings.filter((item) => item.recipientHistory === 'unknown').map((item) => item.recipient)).size;
  const unknownNote = unknown > 0 ? ` ${unknown} penerima lain belum dipindai seluruh riwayatnya.` : '';
  const recent = fresh.filter((item) => item.at <= dataAt && dataAt.getTime() - item.at.getTime() <= WARNING_WINDOW_MS);
  if (recent.length > 0) {
    const wallets = new Set(recent.map((item) => item.recipient)).size;
    const warning: WarningDraft = {
      code: 'fresh_wallet_funding',
      trait,
      title: `Mendanai ${wallets} wallet baru`,
      description: `Kiriman pertama ke ${wallets} wallet yang belum punya riwayat, dalam 7 hari sebelum data diambil. Pola ini sering muncul sebelum peluncuran atau pembelian serempak, tapi juga wajar untuk wallet pribadi baru.${unknownNote}`,
      severity: wallets >= 3 ? 'medium' : 'low',
      classification: 'derived_metric',
      detectedAt: recent[0].at,
      evidence: uniqueEvidence(recent.map((item) => item.evidence)),
    };
    return { warnings: [warning], traits: [traitDraft(trait, 'detected', null, warning.code)] };
  }
  if (fresh.length > 0) {
    const wallets = new Set(fresh.map((item) => item.recipient)).size;
    return { warnings: [], traits: [traitDraft(trait, 'detected', `Pernah mendanai ${wallets} wallet baru, terakhir lebih dari 7 hari sebelum data diambil.${unknownNote}`)] };
  }
  if (unknown > 0) return { warnings: [], traits: [traitDraft(trait, 'unknown', `${unknown} penerima kiriman belum dipindai seluruh riwayatnya, jadi belum bisa dipastikan wallet baru atau bukan.`)] };
  return { warnings: [], traits: [traitDraft(trait, 'clear', 'Semua penerima kiriman sudah punya riwayat sebelum didanai.')] };
}

/* --------------------------------- Gabung --------------------------------- */

const SEVERITY_ORDER: RiskSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

/**
 * Tambahkan hasil deteksi ke draf penilaian. Skor tidak berubah. Ciri yang
 * dideteksi ulang diganti; ciri yang sudah terdeteksi dari alasan berpoin
 * tetap memakai alasannya kecuali ada peringatan baru untuknya.
 */
export function withWarnings(draft: AssessmentDraft, detection: WarningDetection): AssessmentDraft {
  const codes = new Set(draft.warnings.map((warning) => warning.code));
  const warnings = [...draft.warnings, ...detection.warnings.filter((warning) => !codes.has(warning.code))].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || b.detectedAt.getTime() - a.detectedAt.getTime() || a.code.localeCompare(b.code),
  );
  const traits = new Map(draft.traits.map((item) => [item.trait, item]));
  for (const item of detection.traits) {
    const existing = traits.get(item.trait);
    if (existing?.status === 'detected' && item.warningCode === null) continue;
    traits.set(item.trait, item);
  }
  return { ...draft, warnings, traits: [...traits.values()] };
}
