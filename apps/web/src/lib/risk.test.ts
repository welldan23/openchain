import { describe, expect, it } from "vitest";
import { MOCK_RISKS } from "./mock/risk";
import { MOCK_TOKENS } from "./mock/tokens";
import {
  groupTraitChecks,
  parseReasonDrawerAnchor,
  reasonDetail,
  reasonDrawerAnchor,
  isNewWarning,
  traitCheckCounts,
  warningSummary,
  labelSourceSummary,
  RISK_BANDS, riskLevelForScore, scoreBreakdown, scorePosition, sortLabels, sortReasons, sortWarnings, urgentWarnings } from "./risk";
import { DANGER_TRAIT_META } from "./labels";
import type { DangerTraitCheck, RiskLabel, RiskReason, RiskWarning } from "./types";

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
  trait: "tax_change",
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

  it("tingkat dari skor memakai batas yang sama dengan backend: <25, 25–49, 50–74, ≥75", () => {
    expect([0, 24, 25, 49, 50, 74, 75, 100].map(riskLevelForScore)).toEqual(["low", "low", "medium", "medium", "high", "high", "critical", "critical"]);
    expect(riskLevelForScore(24.5)).toBe("low");
    expect(riskLevelForScore(null)).toBe("unknown");
    expect(riskLevelForScore(Number.NaN)).toBe("unknown");
    expect([scorePosition(-5), scorePosition(130), scorePosition(68)]).toEqual([0, 100, 68]);
  });

  it("rentang skala menutup 0–100 tanpa celah atau tumpang tindih", () => {
    expect(RISK_BANDS[0].min).toBe(0);
    expect(RISK_BANDS.at(-1)?.max).toBe(100);
    RISK_BANDS.slice(1).forEach((band, index) => expect(band.min).toBe(RISK_BANDS[index].max + 1));
  });

  it("tingkat di data tiruan cocok dengan skornya", () => {
    for (const risk of MOCK_RISKS) expect(risk.level, risk.title).toBe(riskLevelForScore(risk.score));
    for (const { token, risk } of MOCK_TOKENS) {
      expect(risk.level, token.symbol).toBe(risk.level === "unknown" ? "unknown" : riskLevelForScore(risk.score));
    }
  });

  it("peringatan baru: terdeteksi dalam 24 jam terakhir; ringkasan per tingkat", () => {
    const now = new Date("2026-10-03T12:00:00.000Z");
    const warnings = [
      warning("baru", "high", "2026-10-03T00:00:00.000Z"),
      warning("pas-24-jam", "medium", "2026-10-02T12:00:00.000Z"),
      warning("lama", "medium", "2026-10-01T00:00:00.000Z"),
    ];
    expect(warnings.map((item) => isNewWarning(item, now))).toEqual([true, true, false]);
    const summary = warningSummary(warnings, now);
    expect(summary).toMatchObject({ total: 3, newCount: 2 });
    expect(summary.bySeverity).toEqual({ critical: 0, high: 1, medium: 2, low: 0, info: 0 });
  });

  it("ciri dikelompokkan per kategori; terdeteksi dulu, lalu belum bisa dicek, lalu tidak terdeteksi", () => {
    const checks: DangerTraitCheck[] = [
      { trait: "bridge_hop", status: "clear", note: "x" },
      { trait: "mint_active", status: "clear", note: "x" },
      { trait: "sell_blocked", status: "unknown", note: "x" },
      { trait: "tax_change", status: "detected", warningId: "w" },
    ];
    expect(groupTraitChecks(checks).map((group) => [group.category, group.checks.map((check) => check.trait)])).toEqual([
      ["contract", ["tax_change", "sell_blocked", "mint_active"]],
      ["flow", ["bridge_hop"]],
    ]);
    expect(traitCheckCounts(checks)).toEqual({ detected: 1, unknown: 1, clear: 2 });
  });

  it("data tiruan: ciri terdeteksi punya rujukan bukti, ciri lain punya keterangan, peringatan cocok dengan cirinya", () => {
    for (const risk of MOCK_RISKS) {
      const warningIds = new Set(risk.warnings.map((item) => item.id));
      const reasonIds = new Set(risk.reasons.map((item) => item.id));
      const traits = risk.traitChecks.map((check) => check.trait);
      expect(new Set(traits).size, risk.title).toBe(traits.length);
      for (const check of risk.traitChecks) {
        expect(DANGER_TRAIT_META[check.trait], check.trait).toBeDefined();
        if (check.warningId) expect(warningIds.has(check.warningId), `${risk.title}: ${check.warningId}`).toBe(true);
        if (check.reasonId) expect(reasonIds.has(check.reasonId), `${risk.title}: ${check.reasonId}`).toBe(true);
        if (check.status === "detected") expect(Boolean(check.warningId || check.reasonId || check.note), check.trait).toBe(true);
        else expect(check.note, `${risk.title}: ${check.trait}`).toBeTruthy();
      }
      for (const item of risk.warnings) {
        expect(risk.traitChecks.find((check) => check.trait === item.trait)?.status, `${risk.title}: ${item.id}`).toBe("detected");
      }
    }
  });

  it("tautan laci alasan bisa dibuat dan dibaca ulang; fragmen lain diabaikan", () => {
    expect(reasonDrawerAnchor("nbla-owner-tax")).toBe("detail-alasan-nbla-owner-tax");
    expect(parseReasonDrawerAnchor("#detail-alasan-nbla-owner-tax")).toBe("nbla-owner-tax");
    expect(parseReasonDrawerAnchor("detail-alasan-a%20b")).toBe("a b");
    expect(parseReasonDrawerAnchor("#detail-alasan-")).toBeNull();
    expect(parseReasonDrawerAnchor("#bukti-0xabc")).toBeNull();
  });

  it("detail alasan: porsi skor, ciri terkait, bukti urut waktu dengan hash tanpa detail di akhir, dan navigasi", () => {
    const [nbla, funder] = MOCK_RISKS;
    const tax = reasonDetail(nbla, "nbla-owner-tax");
    expect(tax).toMatchObject({ scoreSharePct: 37, previousId: null, nextId: "nbla-concentration" });
    // Hash bukti pajak tidak ada di data aliran dana tiruan: tetap tampil, tanpa detail.
    expect(tax?.evidence.map((item) => item.detail)).toEqual([null]);
    const funding = reasonDetail(nbla, "nbla-common-funding");
    expect(funding?.traits.map((check) => check.trait)).toEqual(["bundled_launch"]);
    const withDetail = funding!.evidence.filter((item) => item.detail !== null);
    expect(funding!.evidence.slice(0, withDetail.length)).toEqual(withDetail);
    const times = withDetail.map((item) => Date.parse(item.detail!.timestamp));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(reasonDetail(nbla, "nbla-liquidity-lock")).toMatchObject({ scoreSharePct: null, evidence: [] });
    const last = reasonDetail(funder, sortReasons(funder.reasons).at(-1)!.id);
    expect(last?.nextId).toBeNull();
    expect(reasonDetail(nbla, "tidak-ada")).toBeNull();
  });
});
