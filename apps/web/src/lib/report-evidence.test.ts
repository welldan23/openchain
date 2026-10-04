import { describe, expect, it } from "vitest";
import { MOCK_REPORTS } from "./mock/reports";
import { reportStats } from "./report";
import { embedEvidence, evidenceBlockId, filterEvidenceEntries, reportEvidenceEntries } from "./report-evidence";
import type { InvestigationReport } from "./types";

const [draft, final] = MOCK_REPORTS;
const NOW = "2026-10-04T08:00:00.000Z";

describe("panel bukti laporan", () => {
  it("menggabungkan hash dari klaim dan bukti tersemat tanpa dobel, dengan klaim pengutip dan tangkapan data", () => {
    const entries = reportEvidenceEntries(draft);
    const hashes = entries.map((item) => item.txHash.toLowerCase());
    expect(new Set(hashes).size).toBe(hashes.length);
    const claimHashes = draft.sections.flatMap((section) => section.blocks.flatMap((block) => (block.kind === "claim" ? block.claim.evidenceTxHashes : [])));
    for (const hash of claimHashes) expect(hashes).toContain(hash.toLowerCase());
    const embedded = entries.filter((item) => item.embeddedBlockId !== null);
    expect(embedded.map((item) => item.embeddedBlockId)).toEqual(expect.arrayContaining(["bukti-1", "bukti-2"]));
    for (const item of entries) {
      expect(item.capture).toMatchObject({ fetchedAt: draft.snapshot.fetchedAt, sources: draft.snapshot.sources });
      expect(item.chain).toBe("ethereum");
      expect(item.capture.blockNumber).toBe(draft.snapshot.blocks[0].blockNumber);
    }
    expect(entries.some((item) => item.citedBy.length > 0)).toBe(true);
  });

  it("urut waktu transaksi; hash tanpa rincian di akhir", () => {
    const entries = reportEvidenceEntries(draft);
    const withDetail = entries.filter((item) => item.detail);
    expect(entries.slice(0, withDetail.length)).toEqual(withDetail);
    const times = withDetail.map((item) => Date.parse(item.detail!.timestamp));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("chain hash klaim tidak ditebak bila laporan memakai lebih dari satu chain", () => {
    const multi: InvestigationReport = {
      ...draft,
      evidence: [],
      snapshot: { ...draft.snapshot, blocks: [...draft.snapshot.blocks, { chain: "base", blockNumber: 1 }] },
    };
    const entries = reportEvidenceEntries(multi);
    const fromClaimsOnly = entries.filter((item) => item.embeddedBlockId === null);
    expect(fromClaimsOnly.every((item) => item.chain === null && item.capture.blockNumber === null)).toBe(true);
    expect(embedEvidence(multi, fromClaimsOnly[0], NOW)).toEqual({ report: multi, blockId: null });
  });

  it("saringan belum tersemat dan tanpa rincian", () => {
    const entries = reportEvidenceEntries(draft);
    expect(filterEvidenceEntries(entries, "all")).toHaveLength(entries.length);
    expect(filterEvidenceEntries(entries, "not_embedded").every((item) => item.embeddedBlockId === null)).toBe(true);
    expect(filterEvidenceEntries(entries, "no_detail").every((item) => item.detail === null)).toBe(true);
  });

  it("menyematkan hash ke Bukti utama dengan keterangan klaim pengutip; yang sudah tersemat tidak berubah", () => {
    const target = reportEvidenceEntries(draft).find((item) => item.embeddedBlockId === null && item.citedBy.length > 0)!;
    const result = embedEvidence(draft, target, NOW);
    expect(result.blockId).toBe(evidenceBlockId(target.txHash));
    const block = result.report.sections.find((section) => section.id === "bukti")!.blocks.at(-1);
    expect(block).toMatchObject({ kind: "evidence", txHash: target.txHash, chain: "ethereum" });
    expect(block?.kind === "evidence" && block.caption).toContain(target.citedBy[0].title);
    expect(result.report.updatedAt).toBe(NOW);
    const again = reportEvidenceEntries(result.report).find((item) => item.txHash === target.txHash)!;
    expect(embedEvidence(result.report, again, NOW).report).toBe(result.report);
    // Laporan tanpa bagian bukti: bagian baru dibuat di akhir.
    const noSection = { ...final, sections: final.sections.filter((section) => section.id !== "bukti") };
    const entry = reportEvidenceEntries(noSection)[0];
    expect(embedEvidence(noSection, entry, NOW).report.sections.at(-1)?.id).toBe("bukti");
  });

  it("jumlah bukti di kepala laporan sama dengan isi panel bukti", () => {
    for (const item of MOCK_REPORTS) expect(reportStats(item).evidenceCount, item.id).toBe(reportEvidenceEntries(item).length);
  });
});
