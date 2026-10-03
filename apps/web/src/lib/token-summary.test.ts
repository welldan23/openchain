import { describe, expect, it } from "vitest";
import { MOCK_TOKENS } from "./mock/tokens";
import { buildSectionLinks, buildTokenHighlights, countFindingsBySeverity } from "./token-summary";
import type { TokenInvestigation } from "./types";

const bySymbol = (symbol: string): TokenInvestigation =>
  MOCK_TOKENS.find((item) => item.token.symbol === symbol)!;

const plain = (value: string) => value.replace(/[  ]/g, " ");

describe("ringkasan token", () => {
  it("menyusun sorotan lengkap untuk token EVM", () => {
    const highlights = buildTokenHighlights(bySymbol("NBLA"));
    expect(highlights.map((item) => item.id)).toEqual([
      "age",
      "liquidity-ratio",
      "turnover",
      "concentration",
      "findings",
      "verification",
    ]);
    const text = Object.fromEntries(highlights.map((item) => [item.id, plain(item.text)]));
    expect(text.age).toBe("Token berumur 20 hari, dideploy 12 Sep 2026.");
    expect(text["liquidity-ratio"]).toBe("Likuiditas US$612,4 rb, setara 14,5% dari market cap.");
    expect(text.turnover).toBe("Volume 24 jam US$1,84 jt, sekitar 3x likuiditas.");
    expect(text.concentration).toBe(
      "10 holder teratas menguasai 61,8% supply, termasuk pool likuiditas 18,4%.",
    );
    expect(text.findings).toBe("5 temuan risiko: 2 tinggi, 2 sedang, 1 rendah.");
    expect(text.verification).toBe("Source code kontrak terverifikasi di Etherscan.");
  });

  it("memberi tag klasifikasi sesuai asal data", () => {
    const tags = Object.fromEntries(
      buildTokenHighlights(bySymbol("NBLA")).map((item) => [item.id, item.classification]),
    );
    expect(tags).toEqual({
      age: "fact",
      "liquidity-ratio": "calculation",
      turnover: "calculation",
      concentration: "calculation",
      findings: undefined,
      verification: "external_label",
    });
  });

  it("tidak menampilkan status verifikasi source code untuk Solana", () => {
    const ids = buildTokenHighlights(bySymbol("KODO")).map((item) => item.id);
    expect(ids).not.toContain("verification");
    const findings = buildTokenHighlights(bySymbol("KODO")).find((item) => item.id === "findings");
    expect(findings?.text).toBe("5 temuan risiko: 1 kritis, 2 tinggi, 1 sedang, 1 rendah.");
  });

  it("melewati rasio yang tidak bisa dihitung saat data kosong", () => {
    const highlights = buildTokenHighlights(bySymbol("SUNY"));
    expect(highlights.map((item) => item.id)).toEqual(["age", "findings", "verification"]);
    expect(highlights.find((item) => item.id === "age")?.text).toBe(
      "Token berumur 12 menit, dideploy 03 Okt 2026.",
    );
    expect(highlights.find((item) => item.id === "findings")?.text).toBe(
      "Belum ada temuan risiko pada snapshot ini.",
    );
    expect(highlights.find((item) => item.id === "verification")?.text).toContain(
      "belum terverifikasi di BaseScan",
    );
  });

  it("menghitung temuan per tingkat keparahan, urut dari paling parah", () => {
    expect(countFindingsBySeverity(bySymbol("KODO").risk.findings)).toEqual([
      { severity: "critical", count: 1 },
      { severity: "high", count: 2 },
      { severity: "medium", count: 1 },
      { severity: "low", count: 1 },
    ]);
    expect(countFindingsBySeverity([])).toEqual([]);
  });

  it("membuat tautan lompat beserta jumlah isi tiap bagian", () => {
    expect(buildSectionLinks(bySymbol("NBLA"))).toEqual([
      { href: "#risiko", label: "Risiko", count: 5 },
      { href: "#pemegang", label: "Pemegang", count: 10 },
      { href: "#aktivitas", label: "Aktivitas", count: 8 },
      { href: "#bukti", label: "Bukti", count: 6 },
    ]);
  });
});
