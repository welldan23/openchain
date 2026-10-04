/**
 * Pemilih entitas dan temuan dari kasus sumber untuk dimasukkan ke laporan.
 * Yang sudah ada di laporan ditandai dan tidak digandakan. Klaim baru memakai
 * provider dan waktu snapshot kasus, karena dari situlah datanya diambil.
 */
import { mergeEvidence } from "./evidence";
import type { CaseFinding, CaseSubject, InvestigationCase, InvestigationReport, ReportBlock, ReportSection } from "./types";

export const ENTITY_SECTION = { id: "entitas", title: "Entitas yang diselidiki" } as const;
export const FINDING_SECTION = { id: "temuan", title: "Temuan" } as const;

export function subjectKey(subject: Pick<CaseSubject, "kind" | "chain" | "address">): string {
  return `${subject.kind}:${subject.chain ?? "multichain"}:${subject.address.toLowerCase()}`;
}

export function entityBlockId(subject: CaseSubject): string {
  return `entitas-${subjectKey(subject).replace(/[^a-z0-9]+/g, "-")}`;
}

export function findingBlockId(finding: Pick<CaseFinding, "id">): string {
  return `klaim-${finding.id}`;
}

export interface PickerItems {
  subjects: Array<{ key: string; subject: CaseSubject; inReport: boolean }>;
  findings: Array<{ key: string; finding: CaseFinding; inReport: boolean; evidenceCount: number; storedCount: number }>;
}

export function pickerItems(source: InvestigationCase, report: InvestigationReport): PickerItems {
  const blocks = report.sections.flatMap((section) => section.blocks);
  const subjectKeys = new Set(blocks.flatMap((block) => (block.kind === "entity" ? [subjectKey(block.subject)] : [])));
  const claimIds = new Set(blocks.flatMap((block) => (block.kind === "claim" ? [block.claim.id] : [])));
  const stored = new Set(source.evidence.map((item) => item.txHash.toLowerCase()));
  return {
    subjects: source.subjects.map((subject) => ({ key: subjectKey(subject), subject, inReport: subjectKeys.has(subjectKey(subject)) })),
    findings: source.findings.map((finding) => {
      const hashes = [...new Set(finding.evidenceTxHashes.map((hash) => hash.toLowerCase()))];
      return {
        key: finding.id,
        finding,
        inReport: claimIds.has(finding.id),
        evidenceCount: hashes.length,
        storedCount: hashes.filter((hash) => stored.has(hash)).length,
      };
    }),
  };
}

/** Cocokkan teks pencarian ke judul, detail, address, atau label; tanpa teks semua cocok. */
export function matchesPickerQuery(query: string, ...fields: Array<string | undefined>): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || fields.some((field) => field?.toLowerCase().includes(needle));
}

export interface PickResult {
  report: InvestigationReport;
  addedSubjects: number;
  addedFindings: number;
  /** Id blok baru, untuk disorot di layar. */
  addedBlockIds: string[];
}

function withSection(sections: ReportSection[], target: { id: string; title: string }, after: string | null, blocks: ReportBlock[]): ReportSection[] {
  if (blocks.length === 0) return sections;
  const existing = sections.find((section) => section.id === target.id);
  if (existing) return sections.map((section) => (section.id === target.id ? { ...section, blocks: [...section.blocks, ...blocks] } : section));
  const created: ReportSection = { id: target.id, title: target.title, blocks };
  const index = after === null ? -1 : sections.findIndex((section) => section.id === after);
  return [...sections.slice(0, index + 1), created, ...sections.slice(index + 1)];
}

/**
 * Tambahkan subjek dan temuan terpilih. Yang sudah ada dilewati. Entitas
 * masuk bagian "Entitas yang diselidiki" (dibuat setelah Ringkasan bila
 * belum ada), temuan masuk bagian "Temuan"; bukti kasus ikut disalin.
 */
export function addPickedItems(
  report: InvestigationReport,
  source: InvestigationCase,
  selection: { subjectKeys: string[]; findingIds: string[] },
  updatedAt: string,
): PickResult {
  const items = pickerItems(source, report);
  const subjects = items.subjects.filter((item) => !item.inReport && selection.subjectKeys.includes(item.key));
  const findings = items.findings.filter((item) => !item.inReport && selection.findingIds.includes(item.key));
  const entityBlocks: ReportBlock[] = subjects.map(({ subject }) => ({ kind: "entity", id: entityBlockId(subject), subject }));
  const provider = source.snapshot.sources.length > 0 ? source.snapshot.sources.join(", ") : null;
  const claimBlocks: ReportBlock[] = findings.map(({ finding }) => ({
    kind: "claim",
    id: findingBlockId(finding),
    claim: {
      id: finding.id,
      title: finding.title,
      detail: finding.detail,
      classification: finding.classification,
      provider,
      observedAt: source.snapshot.fetchedAt,
      evidenceTxHashes: finding.evidenceTxHashes,
    },
  }));
  const hashes = new Set(findings.flatMap(({ finding }) => finding.evidenceTxHashes.map((hash) => hash.toLowerCase())));
  const copied = source.evidence.filter((item) => hashes.has(item.txHash.toLowerCase()));
  const changed = entityBlocks.length + claimBlocks.length > 0;
  let sections = withSection(report.sections, ENTITY_SECTION, "ringkasan", entityBlocks);
  sections = withSection(sections, FINDING_SECTION, ENTITY_SECTION.id, claimBlocks);
  return {
    report: changed ? { ...report, sections, evidence: mergeEvidence(report.evidence, copied), updatedAt } : report,
    addedSubjects: entityBlocks.length,
    addedFindings: claimBlocks.length,
    addedBlockIds: [...entityBlocks, ...claimBlocks].map((block) => block.id),
  };
}
