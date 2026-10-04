import { describe, expect, it } from "vitest";
import { MOCK_CASES } from "./mock/cases";
import { MOCK_REPORTS } from "./mock/reports";
import { reportIssues } from "./report";
import { addPickedItems, ENTITY_SECTION, entityBlockId, matchesPickerQuery, pickerItems, subjectKey } from "./report-picker";

const [draft] = MOCK_REPORTS;
const source = MOCK_CASES.find((item) => item.id === draft.source?.caseId)!;
const NOW = "2026-10-04T08:00:00.000Z";

describe("pemilih entitas dan temuan laporan", () => {
  it("menandai temuan yang sudah ada di laporan; entitas belum ada", () => {
    const items = pickerItems(source, draft);
    expect(items.findings.map((item) => item.inReport)).toEqual(source.findings.map((_, index) => index < 2));
    expect(items.subjects.every((item) => !item.inReport)).toBe(true);
    for (const item of items.findings) expect(item.storedCount).toBeLessThanOrEqual(item.evidenceCount);
  });

  it("menambahkan pilihan baru: entitas di bagian baru setelah Ringkasan, temuan di Temuan, bukti ikut disalin", () => {
    const [firstSubject] = source.subjects;
    const newFinding = source.findings[2];
    const result = addPickedItems(
      draft,
      source,
      { subjectKeys: [subjectKey(firstSubject)], findingIds: [newFinding.id, source.findings[0].id] },
      NOW,
    );
    expect(result).toMatchObject({ addedSubjects: 1, addedFindings: 1 });
    expect(result.addedBlockIds).toEqual([entityBlockId(firstSubject), `klaim-${newFinding.id}`]);
    expect(result.report.sections.map((section) => section.id).slice(0, 3)).toEqual(["ringkasan", ENTITY_SECTION.id, "temuan"]);
    const added = result.report.sections.find((section) => section.id === "temuan")!.blocks.find((block) => block.id === `klaim-${newFinding.id}`);
    expect(added).toMatchObject({ kind: "claim", claim: { observedAt: source.snapshot.fetchedAt } });
    const provider = added?.kind === "claim" ? added.claim.provider : null;
    expect(provider).toBe(
      newFinding.classification === "heuristic" ? `OpenChain heuristic (data: ${source.snapshot.sources.join(", ")})` : source.snapshot.sources.join(", "),
    );
    const stored = new Set(result.report.evidence.map((item) => item.txHash.toLowerCase()));
    const expected = new Set(source.evidence.map((item) => item.txHash.toLowerCase()));
    for (const hash of newFinding.evidenceTxHashes) expect(stored.has(hash.toLowerCase())).toBe(expected.has(hash.toLowerCase()));
    expect(result.report.updatedAt).toBe(NOW);
    // Klaim dari kasus lengkap: tidak menambah penghalang.
    expect(reportIssues(result.report).filter((issue) => issue.level === "blocker").length).toBe(reportIssues(draft).filter((issue) => issue.level === "blocker").length);
  });

  it("memilih yang sudah ada tidak mengubah laporan; memilih ulang setelah ditambah juga tidak menggandakan", () => {
    const none = addPickedItems(draft, source, { subjectKeys: [], findingIds: [source.findings[0].id] }, NOW);
    expect(none.report).toBe(draft);
    expect(none.addedFindings).toBe(0);
    const once = addPickedItems(draft, source, { subjectKeys: source.subjects.map(subjectKey), findingIds: [] }, NOW).report;
    const twice = addPickedItems(once, source, { subjectKeys: source.subjects.map(subjectKey), findingIds: [] }, NOW);
    expect(twice.addedSubjects).toBe(0);
    expect(twice.report).toBe(once);
  });

  it("pencarian cocok ke salah satu kolom, tanpa peduli huruf besar-kecil", () => {
    expect(matchesPickerQuery("  ", "apa saja")).toBe(true);
    expect(matchesPickerQuery("PENDANA", "Pendana langsung", undefined)).toBe(true);
    expect(matchesPickerQuery("0xABC", "judul", "0xabc123")).toBe(true);
    expect(matchesPickerQuery("bridge", "judul", undefined)).toBe(false);
  });
});
