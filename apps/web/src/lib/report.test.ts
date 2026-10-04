import { describe, expect, it } from "vitest";
import { MOCK_REPORTS } from "./mock/reports";
import { claimClassificationCounts, filterClaims, reportClaims, reportIssues, reportOutline, reportStats } from "./report";
import type { InvestigationReport, ReportClaim } from "./types";

const claim = (id: string, overrides: Partial<ReportClaim> = {}): ReportClaim => ({
  id,
  title: id,
  detail: "",
  classification: "fact",
  provider: "Node RPC",
  observedAt: "2026-10-03T00:00:00.000Z",
  evidenceTxHashes: ["0xaa"],
  ...overrides,
});

function report(overrides: Partial<InvestigationReport> = {}): InvestigationReport {
  return {
    id: "r",
    title: "Laporan",
    summary: "",
    status: "draft",
    createdAt: "2026-10-03T00:00:00.000Z",
    updatedAt: "2026-10-03T00:00:00.000Z",
    source: null,
    sections: [],
    evidence: [{ chain: "ethereum", txHash: "0xAA", timestamp: "2026-10-03T00:00:00.000Z", movements: [] }],
    snapshot: { fetchedAt: "2026-10-03T00:00:00.000Z", blocks: [], sources: [], dataStatus: "complete" },
    ...overrides,
  };
}

describe("kesiapan laporan", () => {
  it("klaim lengkap tidak bermasalah", () => {
    expect(reportIssues(report({ sections: [{ id: "s", title: "Temuan", blocks: [{ kind: "claim", id: "b", claim: claim("ok") }] }] }))).toEqual([]);
  });

  it("klaim tanpa provider atau waktu menghalangi; fakta tanpa hash menghalangi, heuristic tanpa hash cukup peringatan", () => {
    const issues = reportIssues(
      report({
        sections: [
          {
            id: "s",
            title: "Temuan",
            blocks: [
              { kind: "claim", id: "b1", claim: claim("a", { provider: null, observedAt: null }) },
              { kind: "claim", id: "b2", claim: claim("b", { evidenceTxHashes: [] }) },
              { kind: "claim", id: "b3", claim: claim("c", { classification: "heuristic", evidenceTxHashes: [] }) },
            ],
          },
        ],
      }),
    );
    expect(issues.map((issue) => [issue.blockId, issue.kind, issue.level])).toEqual([
      ["b1", "claim_without_provider", "blocker"],
      ["b1", "claim_without_time", "blocker"],
      ["b2", "fact_without_evidence", "blocker"],
      ["b3", "claim_without_evidence", "warning"],
    ]);
  });

  it("bagian kosong, bukti tanpa rincian tersimpan, dan snapshot tidak lengkap jadi peringatan", () => {
    const issues = reportIssues(
      report({
        sections: [
          { id: "kosong", title: "Batasan", blocks: [] },
          {
            id: "bukti",
            title: "Bukti",
            blocks: [
              { kind: "evidence", id: "ada", chain: "ethereum", txHash: "0xaa", caption: "" },
              { kind: "evidence", id: "beda-chain", chain: "base", txHash: "0xaa", caption: "" },
            ],
          },
        ],
        snapshot: { fetchedAt: "2026-10-03T00:00:00.000Z", blocks: [], sources: [], dataStatus: "partial", statusReason: "Satu chain gagal dibaca." },
      }),
    );
    expect(issues.map((issue) => [issue.kind, issue.blockId ?? issue.sectionId])).toEqual([
      ["empty_section", "kosong"],
      ["evidence_not_stored", "beda-chain"],
      ["snapshot_incomplete", null],
    ]);
    expect(issues.at(-1)?.message).toBe("Satu chain gagal dibaca.");
  });

  it("hitungan isi dan daftar isi dengan jumlah masalah per bagian", () => {
    const [draft] = MOCK_REPORTS;
    const stats = reportStats(draft);
    expect(stats).toMatchObject({ sectionCount: 5, noteCount: 2 });
    expect(stats.claimCount).toBeGreaterThanOrEqual(3);
    const outline = reportOutline(draft);
    expect(outline.find((item) => item.id === "temuan")).toMatchObject({ blockers: 2 });
    expect(outline.find((item) => item.id === "batasan")).toMatchObject({ blockCount: 0, warnings: 1 });
  });

  it("data tiruan: laporan final tidak punya penghalang, draf punya; semua hash bukti tersemat tersimpan di laporan final", () => {
    const [draft, final] = MOCK_REPORTS;
    expect(final.status).toBe("final");
    expect(reportIssues(final).filter((issue) => issue.level === "blocker")).toEqual([]);
    expect(reportIssues(final).some((issue) => issue.kind === "evidence_not_stored")).toBe(false);
    expect(reportIssues(draft).filter((issue) => issue.level === "blocker").length).toBeGreaterThan(0);
    for (const item of MOCK_REPORTS) {
      const ids = item.sections.flatMap((section) => [section.id, ...section.blocks.map((block) => `${section.id}/${block.id}`)]);
      expect(new Set(ids).size, item.id).toBe(ids.length);
    }
  });

  it("data tiruan: bukti tersemat draf sesuai keterangannya", () => {
    const [draft] = MOCK_REPORTS;
    const blocks = draft.sections.find((section) => section.id === "bukti")!.blocks;
    const detail = (id: string) => {
      const block = blocks.find((item) => item.id === id);
      return draft.evidence.find((item) => block?.kind === "evidence" && item.txHash === block.txHash)!;
    };
    expect(detail("bukti-1").movements[0].fromLabel?.type).toBe("exchange");
    expect(detail("bukti-2").movements[0].toLabel?.type).toBe("bot");
  });

  it("daftar temuan: urut sesuai laporan, jumlah per jenis, saringan, dan urutan kekuatan bukti", () => {
    const sample = report({
      sections: [
        {
          id: "a",
          title: "Temuan",
          blocks: [
            { kind: "claim", id: "h", claim: claim("h", { classification: "heuristic" }) },
            { kind: "paragraph", id: "p", text: "x" },
            { kind: "claim", id: "asumsi", claim: claim("asumsi", { classification: "assumption", provider: null, evidenceTxHashes: [] }) },
          ],
        },
        { id: "b", title: "Lain", blocks: [{ kind: "claim", id: "f", claim: claim("f", { evidenceTxHashes: ["0xAA", "0xaa", "0xbb"] }) }] },
      ],
    });
    const entries = reportClaims(sample);
    expect(entries.map((entry) => [entry.blockId, entry.sectionTitle, entry.hasProvenance, entry.evidenceCount])).toEqual([
      ["h", "Temuan", true, 1],
      ["asumsi", "Temuan", false, 0],
      ["f", "Lain", true, 2],
    ]);
    expect(claimClassificationCounts(entries)).toEqual([
      { classification: "fact", count: 1 },
      { classification: "heuristic", count: 1 },
      { classification: "assumption", count: 1 },
    ]);
    expect(filterClaims(entries, "heuristic", "document").map((entry) => entry.blockId)).toEqual(["h"]);
    expect(filterClaims(entries, null, "strength").map((entry) => entry.blockId)).toEqual(["f", "h", "asumsi"]);
    expect(filterClaims(entries, null, "document").map((entry) => entry.blockId)).toEqual(["h", "asumsi", "f"]);
  });
});
