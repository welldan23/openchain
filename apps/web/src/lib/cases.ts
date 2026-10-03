/**
 * Logika kasus investigasi: ringkasan untuk daftar, filter tahap kasus, dan
 * pengecekan bahwa setiap temuan punya bukti yang bisa dibuka.
 */
import { CHAINS } from "./chains";
import type { CaseStatus, CaseSummary, ChainId, InvestigationCase } from "./types";

const CHAIN_ORDER = Object.keys(CHAINS) as ChainId[];

export type CaseStatusFilter = "all" | CaseStatus;

const STATUS_FILTERS: CaseStatusFilter[] = ["all", "open", "monitoring", "closed"];

/** Chain yang tersentuh kasus: dari subjek dan bukti, urut baku. */
export function caseChains(item: InvestigationCase): ChainId[] {
  const chains = new Set<ChainId>([
    ...item.subjects.flatMap((subject) => (subject.chain ? [subject.chain] : [])),
    ...item.evidence.map((evidence) => evidence.chain),
  ]);
  return CHAIN_ORDER.filter((chain) => chains.has(chain));
}

export function summarizeCase(item: InvestigationCase): CaseSummary {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    status: item.status,
    updatedAt: item.updatedAt,
    tags: item.tags,
    chains: caseChains(item),
    subjectCount: item.subjects.length,
    findingCount: item.findings.length,
    evidenceCount: item.evidence.length,
    noteCount: item.notes.length,
    dataStatus: item.snapshot.dataStatus,
  };
}

/** Baca filter tahap dari URL (`?tahap=`); nilai asing dianggap semua. */
export function parseCaseStatusFilter(value: string | undefined): CaseStatusFilter {
  return STATUS_FILTERS.find((filter) => filter === value) ?? "all";
}

export function filterCases(cases: CaseSummary[], filter: CaseStatusFilter): CaseSummary[] {
  return filter === "all" ? cases : cases.filter((item) => item.status === filter);
}

export function caseStatusCounts(cases: CaseSummary[]): Record<CaseStatusFilter, number> {
  const counts: Record<CaseStatusFilter, number> = { all: cases.length, open: 0, monitoring: 0, closed: 0 };
  for (const item of cases) counts[item.status] += 1;
  return counts;
}

/** Kasus terbaru diperbarui di atas. */
export function sortCasesByUpdated(cases: CaseSummary[]): CaseSummary[] {
  return [...cases].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
}

/** Hash yang dirujuk temuan tapi tidak ada di daftar bukti kasus. Harus kosong. */
export function missingEvidence(item: InvestigationCase): string[] {
  const known = new Set(item.evidence.map((evidence) => evidence.txHash.toLowerCase()));
  return [...new Set(item.findings.flatMap((finding) => finding.evidenceTxHashes))].filter((hash) => !known.has(hash.toLowerCase()));
}

/** Bukti yang dirujuk temuan dulu (urut kemunculan), lalu bukti lain terbaru dulu. */
export function orderCaseEvidence(item: InvestigationCase): InvestigationCase["evidence"] {
  const cited = item.findings.flatMap((finding) => finding.evidenceTxHashes.map((hash) => hash.toLowerCase()));
  const rank = new Map<string, number>();
  cited.forEach((hash, index) => {
    if (!rank.has(hash)) rank.set(hash, index);
  });
  return [...item.evidence].sort((a, b) => {
    const ra = rank.get(a.txHash.toLowerCase());
    const rb = rank.get(b.txHash.toLowerCase());
    if (ra !== undefined || rb !== undefined) return (ra ?? Infinity) - (rb ?? Infinity);
    return Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.txHash.localeCompare(b.txHash);
  });
}
