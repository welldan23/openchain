import { describe, expect, it } from "vitest";
import { MOCK_FLOWS } from "./mock/flows";
import { MOCK_MULTICHAIN } from "./mock/multichain";
import {
  bridgeFeePct,
  columnLeaders,
  comparisonRows,
  detectInfrastructure,
  filterProfileChains,
  groupActivitiesByDay,
  isEvmAddress,
  matchesActivityFilter,
  parseChainSelection,
  serializeChainSelection,
  sortComparison,
  sortChainActivity,
  summarizeMultichain,
} from "./multichain";

const [funder, busy, quiet] = MOCK_MULTICHAIN;

describe("ringkasan lintas chain", () => {
  it("pendana bersama aktif di Ethereum dan Base, angkanya cocok dengan aliran dana", () => {
    const summary = summarizeMultichain(funder);
    expect(summary.activeChains).toEqual(["ethereum", "base"]);
    expect(summary.inactiveChains).toEqual(["bsc", "arbitrum"]);
    const ethereumFlow = MOCK_FLOWS.find((flow) => flow.chain === "ethereum" && flow.address === funder.address)!;
    const ethereum = funder.chains.find((item) => item.chain === "ethereum")!;
    expect(ethereum.txCount).toBe(ethereumFlow.transfers.length);
    expect(ethereum.inUsd).toBe(69_634.6);
    expect(summary.busiestChain).toBe("ethereum");
    expect(summary).toMatchObject({ bridgeCount: 1, unmatchedBridges: 0 });
  });

  it("menjumlahkan semua chain aktif dan menghitung bridge yang belum cocok", () => {
    const summary = summarizeMultichain(busy);
    expect(summary.activeChains).toHaveLength(4);
    expect(summary.totalTx).toBe(142 + 88 + 65 + 31);
    expect(summary.inUsd).toBe(1_284_500 + 412_800 + 298_400 + 120_600);
    expect(summary.unmatchedBridges).toBe(2);
    expect(summary.bridgedUsd).toBe(49_400 + 25_000 + 19_600);
  });

  it("address yang tidak aktif di mana pun", () => {
    expect(summarizeMultichain(quiet)).toMatchObject({ activeChains: [], totalTx: 0, busiestChain: null, bridgeCount: 0 });
  });
});

describe("urutan dan detail", () => {
  it("chain aktif dulu, transaksi terbanyak di atas", () => {
    expect(sortChainActivity(funder.chains).map((item) => item.chain)).toEqual(["ethereum", "base", "arbitrum", "bsc"]);
  });

  it("menghitung selisih bridge dan memeriksa format address", () => {
    expect(bridgeFeePct(1.5, 1.4985)).toBe(0.1);
    expect(bridgeFeePct(8, undefined)).toBeNull();
    expect(isEvmAddress(funder.address)).toBe(true);
    expect(isEvmAddress("0x1234")).toBe(false);
    expect(isEvmAddress("gfiT3SHJHGgq2bhMnP3HqRaV8dhMDvyqtvCvLok3sXPg")).toBe(false);
  });
});

describe("pilihan jaringan", () => {
  const available = funder.chains.map((item) => item.chain);

  it("membaca pilihan dari URL, nilai asing diabaikan, kosong berarti semua", () => {
    expect(parseChainSelection("base,ethereum,solana,palsu", available)).toEqual(["ethereum", "base"]);
    expect(parseChainSelection(undefined, available)).toEqual(available);
    expect(parseChainSelection("palsu", available)).toEqual(available);
  });

  it("menulis pilihan ke URL dengan urutan tetap, semua chain tidak ditulis", () => {
    expect(serializeChainSelection(["base", "ethereum"], available)).toBe("ethereum,base");
    expect(serializeChainSelection(available, available)).toBeUndefined();
    expect(serializeChainSelection([], available)).toBeUndefined();
  });

  it("menyaring kartu chain dan bridge yang menyentuh chain terpilih", () => {
    const onlyBsc = filterProfileChains(busy, ["bsc"]);
    expect(onlyBsc.chains.map((item) => item.chain)).toEqual(["bsc"]);
    expect(onlyBsc.bridges.map((move) => move.id)).toEqual(["busy-bsc-base"]);
    expect(summarizeMultichain(onlyBsc).totalTx).toBe(88);
    expect(filterProfileChains(busy, ["ethereum"]).bridges).toHaveLength(2);
  });
});

describe("linimasa lintas chain", () => {
  it("kaki bridge pendana ditandai di kedua chain", () => {
    const legs = funder.activities.filter((item) => item.bridgeId === "funder-eth-base");
    expect(legs.map((item) => [item.chain, item.kind])).toEqual([
      ["ethereum", "bridge_out"],
      ["base", "bridge_in"],
    ]);
    expect(funder.activities).toHaveLength(13 + 3);
  });

  it("menyaring per jenis dan per jaringan terpilih", () => {
    // Kiriman ETH→Arbitrum punya dua kaki; dua kiriman lain belum diterima, jadi satu kaki saja.
    expect(busy.activities.filter((item) => matchesActivityFilter(item, "bridge"))).toHaveLength(4);
    expect(busy.activities.filter((item) => matchesActivityFilter(item, "in")).every((item) => item.kind === "in")).toBe(true);
    expect(filterProfileChains(busy, ["arbitrum"]).activities.map((item) => item.id)).toEqual(["arb-bridge", "arb-1"]);
  });

  it("mengelompokkan per hari WIB, terbaru di atas", () => {
    const groups = groupActivitiesByDay(busy.activities);
    expect(groups[0].day).toBe("2026-10-03");
    expect(groups[0].items.map((item) => item.id)).toEqual(["eth-3", "base-bridge", "bsc-2"]);
    // 2 Okt 21.15 UTC = 3 Okt 04.15 WIB, jadi masuk hari 3 Okt.
    expect(groups.find((group) => group.day === "2026-10-02")).toBeUndefined();
    expect(groups.flatMap((group) => group.items)).toHaveLength(busy.activities.length);
    expect(groupActivitiesByDay([])).toEqual([]);
  });
});

describe("tabel perbandingan antar chain", () => {
  it("menghitung porsi transaksi, selisih, dan bridge per chain", () => {
    const rows = comparisonRows(busy);
    const ethereum = rows.find((row) => row.chain === "ethereum")!;
    expect(ethereum.txSharePct).toBe(43.56);
    expect(ethereum.netUsd).toBe(83_200);
    expect([ethereum.bridgesOut, ethereum.bridgesIn]).toEqual([1, 0]);
    expect(rows.find((row) => row.chain === "arbitrum")).toMatchObject({ bridgesOut: 0, bridgesIn: 1 });
    expect(rows.reduce((sum, row) => sum + row.txSharePct, 0)).toBeCloseTo(100, 1);
  });

  it("mengurutkan per kolom, chain tidak aktif selalu di bawah", () => {
    const rows = comparisonRows(funder);
    expect(sortComparison(rows, "txCount", "asc").map((row) => row.chain)).toEqual(["base", "ethereum", "arbitrum", "bsc"]);
    expect(sortComparison(rows, "chain", "desc").map((row) => row.chain)).toEqual(["ethereum", "base", "bsc", "arbitrum"]);
  });

  it("menandai chain tertinggi per kolom", () => {
    const leaders = columnLeaders(comparisonRows(busy));
    expect(leaders).toMatchObject({ txCount: "ethereum", balanceUsd: "ethereum", netUsd: "ethereum" });
    expect(columnLeaders(comparisonRows(quiet))).toEqual({});
  });
});

describe("jembatan dan router terdeteksi", () => {
  it("menggabungkan satu bridge di dua chain dan router per nama", () => {
    const found = detectInfrastructure(busy.activities);
    expect(found.map((item) => [item.type, item.label.name, item.interactions])).toEqual([
      ["router", "Router DEX", 3],
      ["bridge", "Bridge resmi Arbitrum", 2],
      ["bridge", "Bridge lintas chain", 1],
      ["bridge", "Bridge ke Ethereum", 1],
    ]);
    const arbitrumBridge = found.find((item) => item.label.name === "Bridge resmi Arbitrum")!;
    expect(arbitrumBridge.chains).toEqual(["ethereum", "arbitrum"]);
    expect(arbitrumBridge.addresses).toHaveLength(2);
    expect(found[0].totalUsd).toBe(6 * 2_480 + 35 * 2_500 + 4 * 2_460);
  });

  it("pendana: dua kaki bridge (US$3.765 dan US$3.761) lalu router DEX (US$2.994)", () => {
    expect(detectInfrastructure(funder.activities).map((item) => item.label.name)).toEqual([
      "Bridge ke Base",
      "Bridge dari Ethereum",
      "Router DEX",
    ]);
    expect(detectInfrastructure([])).toEqual([]);
  });
});
