/**
 * Susun klaim dan entitas laporan dari kasus sumber dan penilaian risiko,
 * murni. Setiap klaim membawa provider dan waktu datanya dari sumber yang
 * benar-benar dipakai: snapshot kasus untuk temuan kasus, snapshot penilaian
 * untuk temuan risiko. Dugaan disebut dibuat heuristic OpenChain. Kunci asal
 * (`sourceKey`) mencegah isi yang sama masuk dua kali.
 */
import type { CaseFindingView, CaseSubjectView } from '../cases/cases.types.js';
import type { InfoClassification } from '../database/schema/enums.js';
import type { RiskFindingView } from '../risk/risk.types.js';
import { CLAIM_DETAIL_MAX, CLAIM_TITLE_MAX } from './report-input.js';
import type { ResolvedBlock } from './reports.repository.js';
import type { ReportEntityView } from './reports.types.js';

export const ENTITY_SECTION = 'Entitas yang diselidiki';
export const FINDING_SECTION = 'Temuan';
export const SUMMARY_SECTION = 'Ringkasan';

export type ComposedBlock = ResolvedBlock & { sourceKey: string };

/** Sama dengan kunci subjek di frontend. */
export function subjectKey(subject: Pick<ReportEntityView, 'kind' | 'chain' | 'address'>): string {
  return `${subject.kind}:${subject.chain ?? 'multichain'}:${subject.address.toLowerCase()}`;
}

export const caseFindingKey = (id: string) => `case:${id}`;
export const riskFindingKey = (chain: string, address: string, kind: 'reason' | 'warning', code: string) => `risk:${chain}:${address.toLowerCase()}:${kind}:${code}`;
export const entityKey = (key: string) => `subject:${key}`;

/** Dugaan dibuat heuristic OpenChain dari data provider; klaim lain langsung dari provider datanya. */
export function providerFor(classification: InfoClassification, sources: string[]): string | null {
  const data = sources.length > 0 ? sources.join(', ') : null;
  if (classification === 'heuristic') return `OpenChain heuristic${data ? ` (data: ${data})` : ''}`;
  return data;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

export function entityBlock(subject: Pick<CaseSubjectView, 'kind' | 'chain' | 'address' | 'title' | 'href'>): ComposedBlock {
  return {
    kind: 'entity',
    id: null,
    subject: { kind: subject.kind, chain: subject.chain, address: subject.address, title: subject.title, href: subject.href },
    sourceKey: entityKey(subjectKey(subject)),
  };
}

export function caseFindingClaim(finding: CaseFindingView, snapshot: { fetchedAt: string; sources: string[] }): ComposedBlock {
  return {
    kind: 'claim',
    id: null,
    claim: {
      title: clip(finding.title, CLAIM_TITLE_MAX),
      detail: clip(finding.detail, CLAIM_DETAIL_MAX),
      classification: finding.classification,
      provider: providerFor(finding.classification, snapshot.sources),
      observedAt: new Date(snapshot.fetchedAt),
      chain: null,
      evidence: finding.evidence.map((item) => ({ chain: item.chain, txHash: item.txHash })),
    },
    sourceKey: caseFindingKey(finding.id),
  };
}

export interface AssessmentContext {
  chain: string;
  address: string;
  subjectTitle: string;
  methodology: string;
  score: number | null;
  sources: string[];
  fetchedAt: Date;
}

/** Klaim dari temuan penilaian risiko; alasan menyebut sumbangan poinnya, peringatan disebut tidak menambah skor. */
export function riskFindingClaim(finding: RiskFindingView, context: AssessmentContext): ComposedBlock {
  const scoring =
    finding.kind === 'warning'
      ? 'Peringatan dini; tidak menambah skor.'
      : finding.points === null
        ? `Tidak ikut dihitung ke skor (${context.methodology}).`
        : `Menyumbang ${finding.points} poin ke skor ${context.score ?? '–'} (${context.methodology}).`;
  return {
    kind: 'claim',
    id: null,
    claim: {
      title: clip(`${context.subjectTitle}: ${finding.title}`, CLAIM_TITLE_MAX),
      detail: clip(`${finding.description} ${scoring}`, CLAIM_DETAIL_MAX),
      classification: finding.classification,
      provider: providerFor(finding.classification, context.sources),
      observedAt: context.fetchedAt,
      chain: null,
      evidence: finding.evidence.map((item) => ({ chain: item.chain, txHash: item.txHash })),
    },
    sourceKey: riskFindingKey(context.chain, context.address, finding.kind, finding.id),
  };
}

/**
 * Urutan bagian setelah bagian baru disisipkan: entitas setelah Ringkasan
 * (atau paling awal), temuan setelah entitas (atau paling akhir).
 */
export function insertAt(titles: string[], title: string): number {
  if (title === ENTITY_SECTION) {
    const summary = titles.indexOf(SUMMARY_SECTION);
    return summary === -1 ? 0 : summary + 1;
  }
  const entity = titles.indexOf(ENTITY_SECTION);
  return entity === -1 ? titles.length : entity + 1;
}
