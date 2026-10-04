import { describe, expect, it } from "vitest";
import { labelSourceSummary, scoreBreakdown, sortLabels, sortReasons, sortWarnings, urgentWarnings } from "./risk";
import type { RiskLabel, RiskReason, RiskWarning } from "./types";

const reason = (id: string, severity: RiskReason["severity"], classification: RiskReason["classification"], points: number | null): RiskReason => ({
  id,
  title: id,
  description: "",
  severity,
  classification,
  points,
  evidenceTxHashes: [],
});

const warning = (id: string, severity: RiskWarning["severity"], detectedAt: string): RiskWarning => ({
  id,
  title: id,
  description: "",
  severity,
  classification: "fact",
  detectedAt,
  evidenceTxHashes: [],
});

const label = (name: string, source: RiskLabel["source"], sourceName: string, confidence?: number): RiskLabel => ({
  type: "unknown",
  name,
  source,
  sourceName,
  confidence,
  basis: "",
  addedAt: "2026-10-01T00:00:00.000Z",
  evidenceTxHashes: [],
});

describe("halaman risiko objek", () => {
  it("alasan terberat dulu, lalu poin terbesar; alasan tanpa poin di belakang tingkatnya", () => {
    const sorted = sortReasons([
      reason("a", "medium", "heuristic", 10),
      reason("b", "high", "fact", 5),
      reason("c", "medium", "assumption", null),
      reason("d", "medium", "calculation", 20),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("rincian skor per jenis informasi, alasan tanpa poin dihitung terpisah", () => {
    const breakdown = scoreBreakdown({
      score: 68,
      reasons: [
        reason("a", "high", "fact", 25),
        reason("b", "high", "calculation", 20),
        reason("c", "medium", "heuristic", 15),
        reason("d", "low", "external_label", 8),
        reason("e", "medium", "assumption", null),
        reason("f", "low", "fact", 0),
      ],
    });
    expect(breakdown.parts).toEqual([
      { classification: "fact", points: 25, reasonCount: 2 },
      { classification: "calculation", points: 20, reasonCount: 1 },
      { classification: "external_label", points: 8, reasonCount: 1 },
      { classification: "heuristic", points: 15, reasonCount: 1 },
    ]);
    expect(breakdown).toMatchObject({ countedPoints: 68, uncounted: 1, unexplained: 0 });
  });

  it("skor yang belum dinilai tidak punya selisih; selisih poin ditampilkan apa adanya", () => {
    expect(scoreBreakdown({ score: null, reasons: [] })).toEqual({ parts: [], countedPoints: 0, uncounted: 0, unexplained: null });
    expect(scoreBreakdown({ score: 40, reasons: [reason("a", "high", "fact", 30)] }).unexplained).toBe(10);
  });

  it("peringatan terbaru dulu; yang mendesak hanya tinggi dan kritis", () => {
    const warnings = [
      warning("lama", "critical", "2026-10-01T00:00:00.000Z"),
      warning("baru-sedang", "medium", "2026-10-03T00:00:00.000Z"),
      warning("baru-tinggi", "high", "2026-10-03T00:00:00.000Z"),
    ];
    expect(sortWarnings(warnings).map((item) => item.id)).toEqual(["baru-tinggi", "baru-sedang", "lama"]);
    expect(urgentWarnings(warnings).map((item) => item.id)).toEqual(["lama", "baru-tinggi"]);
  });

  it("label eksternal dulu, lalu dugaan dengan keyakinan tertinggi; sumber diringkas", () => {
    const labels = [label("dugaan-rendah", "heuristic", "OpenChain heuristic", 0.4), label("dugaan-tinggi", "heuristic", "OpenChain heuristic", 0.8), label("explorer", "external", "Label publik explorer")];
    expect(sortLabels(labels).map((item) => item.name)).toEqual(["explorer", "dugaan-tinggi", "dugaan-rendah"]);
    expect(labelSourceSummary(labels)).toEqual({ external: 1, heuristic: 2, sourceNames: ["Label publik explorer", "OpenChain heuristic"] });
  });
});
