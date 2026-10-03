import { describe, expect, it } from "vitest";
import {
  buildSupplyTiers,
  describeLabelSources,
  groupHoldersByLabel,
} from "./holder-distribution";
import { MOCK_TOKENS } from "./mock/tokens";
import type { TokenInvestigation } from "./types";

const bySymbol = (symbol: string): TokenInvestigation =>
  MOCK_TOKENS.find((item) => item.token.symbol === symbol)!;

describe("sebaran supply per peringkat", () => {
  it("membagi supply jadi #1, #2–10, #11–50, dan sisanya", () => {
    const { holders } = bySymbol("NBLA");
    const tiers = buildSupplyTiers(holders.top, holders.concentration);
    expect(tiers).toEqual([
      { id: "top1", label: "Holder #1", pct: 18.4, holderName: "Uniswap V2: NBLA/WETH" },
      { id: "top2-10", label: "Holder #2–10", pct: 43.4 },
      { id: "top11-50", label: "Holder #11–50", pct: 16.5 },
      { id: "rest", label: "Holder lainnya", pct: 21.7 },
    ]);
    const total = tiers.reduce((sum, tier) => sum + tier.pct, 0);
    expect(Math.round(total * 100) / 100).toBe(100);
  });

  it("kosong bila belum ada data holder", () => {
    const { holders } = bySymbol("SUNY");
    expect(buildSupplyTiers(holders.top, holders.concentration)).toEqual([]);
  });

  it("tidak menghasilkan persen negatif dari data yang tidak konsisten", () => {
    const { holders } = bySymbol("NBLA");
    const tiers = buildSupplyTiers(holders.top, { ...holders.concentration, top50Pct: 50 });
    expect(tiers.find((tier) => tier.id === "top11-50")?.pct).toBe(0);
  });
});

describe("komposisi holder menurut label", () => {
  it("mengelompokkan dan mengurutkan dari porsi terbesar", () => {
    const groups = groupHoldersByLabel(bySymbol("NBLA").holders.top);
    expect(groups.map((group) => [group.label, group.pct, group.count])).toEqual([
      ["Pool likuiditas", 18.4, 1],
      ["Belum dikenal", 12.3, 3],
      ["Bot", 10, 2],
      ["Deployer", 9.6, 1],
      ["Treasury", 4.6, 1],
      ["Exchange", 3.8, 1],
      ["Whale", 3.1, 1],
    ]);
    const total = groups.reduce((sum, group) => sum + group.pct, 0);
    expect(Math.round(total * 100) / 100).toBe(61.8);
  });

  it("mencatat asal label tiap kelompok", () => {
    const groups = groupHoldersByLabel(bySymbol("NBLA").holders.top);
    const sources = Object.fromEntries(groups.map((group) => [group.type, group.sources]));
    expect(sources.liquidity_pool).toEqual(["external"]);
    expect(sources.bot).toEqual(["heuristic"]);
    expect(sources.unknown).toEqual([]);
    expect(describeLabelSources(["external"])).toBe("label eksternal");
    expect(describeLabelSources(["heuristic"])).toBe("heuristic");
    expect(describeLabelSources(["external", "heuristic"])).toBe("eksternal & heuristic");
    expect(describeLabelSources([])).toBe("tanpa label");
  });
});
