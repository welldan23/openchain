import { describe, expect, it } from "vitest";
import {
  caseChains,
  caseStatusCounts,
  filterCases,
  missingEvidence,
  orderCaseEvidence,
  parseCaseStatusFilter,
  sortCasesByUpdated,
  summarizeCase,
} from "./cases";
import { MOCK_CASES } from "./mock/cases";
import type { InvestigationCase, TxEvidence } from "./types";

const evidence = (txHash: string, timestamp: string, chain: TxEvidence["chain"] = "ethereum"): TxEvidence => ({
  chain,
  txHash,
  timestamp,
  movements: [],
});

const base: InvestigationCase = {
  id: "k",
  title: "K",
  summary: "",
  status: "open",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
  tags: [],
  subjects: [{ kind: "address", chain: "base", address: "0x1", title: "A", href: "/a" }],
  findings: [
    { id: "f1", title: "", detail: "", classification: "fact", evidenceTxHashes: ["0xB", "0xc"] },
    { id: "f2", title: "", detail: "", classification: "heuristic", evidenceTxHashes: ["0xb", "0xZZ"] },
  ],
  evidence: [evidence("0xa", "2026-10-01T03:00:00.000Z", "arbitrum"), evidence("0xb", "2026-09-01T00:00:00.000Z"), evidence("0xd", "2026-10-01T05:00:00.000Z"), evidence("0xc", "2026-09-02T00:00:00.000Z")],
  steps: [],
  notes: [],
  snapshot: { fetchedAt: "2026-10-02T00:00:00.000Z", blocks: [], sources: [], dataStatus: "complete" },
};

describe("kasus investigasi", () => {
  it("merangkum kasus untuk daftar, chain dari subjek dan bukti", () => {
    expect(caseChains(base)).toEqual(["ethereum", "base", "arbitrum"]);
    expect(summarizeCase(base)).toMatchObject({ subjectCount: 1, findingCount: 2, evidenceCount: 4, noteCount: 0, dataStatus: "complete" });
  });

  it("menemukan hash temuan yang tidak punya bukti, tanpa peduli huruf besar/kecil", () => {
    expect(missingEvidence(base)).toEqual(["0xZZ"]);
  });

  it("mengurutkan bukti: yang dirujuk temuan dulu, lalu sisanya terbaru dulu", () => {
    expect(orderCaseEvidence(base).map((item) => item.txHash)).toEqual(["0xb", "0xc", "0xd", "0xa"]);
  });

  it("menyaring dan menghitung tahap kasus", () => {
    const summaries = MOCK_CASES.map(summarizeCase);
    expect(parseCaseStatusFilter("closed")).toBe("closed");
    expect(parseCaseStatusFilter("aneh")).toBe("all");
    expect(caseStatusCounts(summaries)).toEqual({ all: 3, open: 1, monitoring: 1, closed: 1 });
    expect(filterCases(summaries, "monitoring").map((item) => item.id)).toEqual(["pembuat-kodo"]);
    expect(sortCasesByUpdated(summaries).map((item) => item.id)).toEqual(["bundler-nbla", "pendana-ke-base", "pembuat-kodo"]);
  });
});

describe("kasus tiruan", () => {
  it.each(MOCK_CASES.map((item) => [item.id, item] as const))("%s: setiap temuan punya bukti yang bisa dibuka", (_id, item) => {
    expect(item.findings.length).toBeGreaterThan(0);
    expect(item.findings.every((finding) => finding.evidenceTxHashes.length > 0)).toBe(true);
    expect(missingEvidence(item)).toEqual([]);
  });

  it("langkah dan subjek menunjuk halaman yang ada; status selain lengkap punya alasan", () => {
    for (const item of MOCK_CASES) {
      expect(item.subjects.every((subject) => /^\/(token|flow|multichain)\//.test(subject.href))).toBe(true);
      expect(item.steps.every((step) => /^\/(token|flow|trace|map|multichain)\//.test(step.href))).toBe(true);
      if (item.snapshot.dataStatus !== "complete") expect(item.snapshot.statusReason).toBeTruthy();
      expect(item.snapshot.blocks.length).toBeGreaterThan(0);
    }
  });
});
