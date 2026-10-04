import { describe, expect, it } from "vitest";
import { MOCK_FAILING_RISK, MOCK_RISKS } from "../mock/risk";
import { scoreBreakdown } from "../risk";
import { getObjectRisk, listSampleRisks, riskFailureDemoPath, riskPath } from "./risk";

describe("API tiruan risiko objek", () => {
  it("mencari objek tanpa peduli huruf besar-kecil address EVM", async () => {
    const [first] = MOCK_RISKS;
    expect(await getObjectRisk(first.chain, first.address.toUpperCase().replace("0X", "0x"))).toBe(first);
    expect(await getObjectRisk("base", first.address)).toBeNull();
  });

  it("address simulasi gagal melempar error, bukan hasil kosong", async () => {
    await expect(getObjectRisk(MOCK_FAILING_RISK.chain, MOCK_FAILING_RISK.address)).rejects.toThrow("Simulasi");
    expect(riskFailureDemoPath()).toBe(riskPath(MOCK_FAILING_RISK.chain, MOCK_FAILING_RISK.address));
  });

  it("daftar contoh memuat jenis objek dan jumlah peringatan", async () => {
    const samples = await listSampleRisks();
    expect(samples.map((item) => item.kind)).toEqual(["token", "wallet", "contract", "wallet"]);
    expect(samples[0].warningCount).toBe(2);
  });

  it("data tiruan konsisten: poin alasan menjelaskan seluruh skor", () => {
    for (const risk of MOCK_RISKS) {
      const breakdown = scoreBreakdown(risk);
      expect(breakdown.unexplained, risk.title).toBe(risk.score === null ? null : 0);
      if (risk.score === null) expect(risk.reasons).toEqual([]);
    }
  });

  it("data tiruan konsisten: bukti wallet dan kontrak bisa dibuka detailnya; label dugaan punya keyakinan", () => {
    for (const risk of MOCK_RISKS.filter((item) => item.kind !== "token")) {
      const known = new Set(risk.evidence.map((item) => item.txHash));
      const hashes = [...risk.reasons, ...risk.warnings, ...risk.labels].flatMap((item) => item.evidenceTxHashes);
      expect(hashes.filter((hash) => !known.has(hash)), risk.title).toEqual([]);
    }
    for (const label of MOCK_RISKS.flatMap((item) => item.labels)) {
      if (label.source === "heuristic") expect(label.confidence, label.name).toBeGreaterThan(0);
      else expect(label.confidence, label.name).toBeUndefined();
    }
  });
});
