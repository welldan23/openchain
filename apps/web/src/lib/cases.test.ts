import { describe, expect, it } from "vitest";
import {
  canSaveFinding,
  caseChains,
  caseStatusCounts,
  filterCases,
  findingsFromClusters,
  findingsFromRisk,
  missingEvidence,
  orderCaseEvidence,
  parseCaseStatusFilter,
  planSaveToCase,
  sortCasesByUpdated,
  subjectKey,
  summarizeCase,
  validateCaseTitle,
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

describe("rencana simpan ke kasus", () => {
  const subject = { kind: "address" as const, chain: "base" as const, address: "0xABC", title: "A", href: "/a" };
  const finding = (id: string, title: string, hashes: string[]) => ({ id, title, detail: "", classification: "fact" as const, evidenceTxHashes: hashes });

  it("mengenali subjek yang sama tanpa peduli huruf besar/kecil address EVM", () => {
    const target = { ...base, subjects: [{ ...subject, address: "0xabc" }] };
    expect(planSaveToCase(target, subject, []).subjectIsNew).toBe(false);
    expect(planSaveToCase(target, { ...subject, chain: "ethereum" }, []).subjectIsNew).toBe(true);
    expect(subjectKey({ kind: "address", chain: "solana", address: "AbC" })).toBe("address:solana:AbC");
  });

  it("memisahkan temuan baru dari yang sudah ada (id sama, atau judul dan hash sama)", () => {
    const target = { ...base, findings: [finding("f1", "Lama", ["0xA", "0xb"])] };
    const plan = planSaveToCase(target, subject, [
      finding("f1", "Beda judul", []),
      finding("f9", "Lama", ["0xb", "0xa"]),
      finding("f2", "Baru", ["0xc"]),
      finding("f2", "Baru", ["0xc"]),
    ]);
    expect(plan.newFindings.map((item) => item.id)).toEqual(["f2"]);
    expect(plan.duplicateFindings.map((item) => item.id)).toEqual(["f1", "f9", "f2"]);
    expect(planSaveToCase(null, subject, [finding("f2", "Baru", ["0xc"])])).toMatchObject({ subjectIsNew: true });
  });

  it("memvalidasi judul kasus baru", () => {
    expect(validateCaseTitle("  Dugaan   bundler ")).toEqual({ ok: true, title: "Dugaan bundler" });
    expect(validateCaseTitle(" ab ")).toMatchObject({ ok: false });
    expect(validateCaseTitle("x".repeat(121))).toMatchObject({ ok: false, error: expect.stringMatching(/121/) });
  });

  it("mengubah sinyal kelompok dan temuan risiko jadi calon temuan kasus", () => {
    const clusters = [
      {
        id: "c1",
        name: "Kelompok",
        reason: "",
        labels: [],
        confidence: "high" as const,
        caveats: [],
        signals: [
          { id: "s1", label: "Pendana sama", detail: "Detail", matched: true, evidenceTxHashes: ["0x1"] },
          { id: "s2", label: "Tidak cocok", detail: "", matched: false, evidenceTxHashes: [] },
        ],
      },
    ];
    expect(findingsFromClusters(clusters)).toEqual([
      { id: "c1:s1", title: "Pendana sama", detail: "Kelompok: Detail", classification: "heuristic", evidenceTxHashes: ["0x1"] },
    ]);
    const risk = findingsFromRisk([
      { id: "r1", title: "Pajak", description: "D", severity: "high", classification: "fact", evidenceTxHashes: [] },
    ]);
    expect(risk[0]).toMatchObject({ id: "risiko:r1", classification: "fact" });
    expect(canSaveFinding(risk[0])).toBe(false);
  });
});
