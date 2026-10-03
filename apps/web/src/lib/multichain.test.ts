import { describe, expect, it } from "vitest";
import { MOCK_FLOWS } from "./mock/flows";
import { MOCK_MULTICHAIN } from "./mock/multichain";
import { bridgeFeePct, isEvmAddress, sortChainActivity, summarizeMultichain } from "./multichain";

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
