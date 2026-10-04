/**
 * Logika kasus investigasi: ringkasan untuk daftar, filter tahap kasus, dan
 * pengecekan bahwa setiap temuan punya bukti yang bisa dibuka.
 */
import { CHAINS } from "./chains";
import type {
  CaseFinding,
  CaseStatus,
  CaseSubject,
  CaseSummary,
  ChainId,
  InvestigationCase,
  MapCluster,
  RiskFinding,
} from "./types";

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

/* ----------------------------- Simpan ke kasus ----------------------------- */

export const CASE_TITLE_MIN = 3;
export const CASE_TITLE_MAX = 120;

export type CaseTitleValidation = { ok: true; title: string } | { ok: false; error: string };

/** Judul kasus baru: spasi dirapikan, panjang 3–120 karakter. */
export function validateCaseTitle(raw: string): CaseTitleValidation {
  const title = raw.trim().replace(/\s+/g, " ");
  if (title.length < CASE_TITLE_MIN) return { ok: false, error: `Judul kasus minimal ${CASE_TITLE_MIN} karakter.` };
  if (title.length > CASE_TITLE_MAX) {
    return { ok: false, error: `Judul kasus maksimal ${CASE_TITLE_MAX} karakter (sekarang ${title.length}).` };
  }
  return { ok: true, title };
}

/** Kunci subjek: address EVM tidak peka huruf besar/kecil, Solana peka. */
export function subjectKey(subject: Pick<CaseSubject, "kind" | "chain" | "address">): string {
  const evm = subject.address.startsWith("0x");
  return `${subject.kind}:${subject.chain ?? "multi"}:${evm ? subject.address.toLowerCase() : subject.address}`;
}

function evidenceSet(finding: CaseFinding): string {
  return [...new Set(finding.evidenceTxHashes.map((hash) => hash.toLowerCase()))].sort().join(",");
}

/** Temuan yang sama: id sama, atau judul dan kumpulan hash buktinya sama. */
function sameFinding(a: CaseFinding, b: CaseFinding): boolean {
  return a.id === b.id || (a.title === b.title && evidenceSet(a) === evidenceSet(b));
}

export interface SaveToCasePlan {
  subjectIsNew: boolean;
  newFindings: CaseFinding[];
  duplicateFindings: CaseFinding[];
}

/**
 * Apa yang benar-benar bertambah bila subjek dan temuan disimpan ke `target`
 * (`null` = kasus baru). Yang sudah ada tidak digandakan.
 */
export function planSaveToCase(target: InvestigationCase | null, subject: CaseSubject, findings: CaseFinding[]): SaveToCasePlan {
  const key = subjectKey(subject);
  const subjectIsNew = !target?.subjects.some((item) => subjectKey(item) === key);
  const newFindings: CaseFinding[] = [];
  const duplicateFindings: CaseFinding[] = [];
  for (const finding of findings) {
    const existing = [...(target?.findings ?? []), ...newFindings];
    if (existing.some((item) => sameFinding(item, finding))) duplicateFindings.push(finding);
    else newFindings.push(finding);
  }
  return { subjectIsNew, newFindings, duplicateFindings };
}

/** Temuan hanya bisa disimpan ke kasus bila punya setidaknya satu hash bukti. */
export function canSaveFinding(finding: CaseFinding): boolean {
  return finding.evidenceTxHashes.length > 0;
}

/** Sinyal kelompok yang terpenuhi di peta hubungan, sebagai calon temuan kasus. */
export function findingsFromClusters(clusters: MapCluster[]): CaseFinding[] {
  return clusters.flatMap((cluster) =>
    cluster.signals
      .filter((signal) => signal.matched)
      .map((signal) => ({
        id: `${cluster.id}:${signal.id}`,
        title: signal.label,
        detail: `${cluster.name}: ${signal.detail}`,
        classification: "heuristic" as const,
        evidenceTxHashes: signal.evidenceTxHashes,
      })),
  );
}

/** Temuan risiko token sebagai calon temuan kasus; klasifikasinya dipertahankan. */
export function findingsFromRisk(findings: RiskFinding[]): CaseFinding[] {
  return findings.map((finding) => ({
    id: `risiko:${finding.id}`,
    title: finding.title,
    detail: finding.description,
    classification: finding.classification,
    evidenceTxHashes: finding.evidenceTxHashes,
  }));
}
