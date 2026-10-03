import { describe, expect, it } from "vitest";
import { addressKey, addressTitle, filterTransfers, sortTransfersNewestFirst, summarizeFlow, topCounterparties } from "./fund-flow";
import { MOCK_FLOWS } from "./mock/flows";
import type { AddressFlow, FlowTransfer } from "./types";

const byLabel = (name: string): AddressFlow => MOCK_FLOWS.find((flow) => flow.label?.name === name)!;
const funder = byLabel("Pendana bersama 5 wallet");

function transfer(overrides: Partial<FlowTransfer>): FlowTransfer {
  return {
    id: "t",
    direction: "in",
    counterparty: "0xAbC0000000000000000000000000000000000001",
    asset: { symbol: "ETH", address: null },
    amount: 1,
    amountUsd: 100,
    txHash: "0x01",
    timestamp: "2026-09-12T07:00:00.000Z",
    ...overrides,
  };
}

describe("ringkasan aliran dana", () => {
  it("menjumlahkan dana masuk, keluar, dan selisihnya dalam USD", () => {
    expect(summarizeFlow(funder.chain, funder.transfers)).toEqual({
      inUsd: 69_634.6,
      outUsd: 44_060,
      netUsd: 25_574.6,
      inCount: 6,
      outCount: 7,
      unpricedCount: 1,
      counterpartyCount: 9,
    });
  });

  it("tidak menebak nilai transfer yang harganya tidak diketahui", () => {
    const totals = summarizeFlow("ethereum", [
      transfer({ amountUsd: 100 }),
      transfer({ id: "t2", amountUsd: undefined, amount: 5_000 }),
      transfer({ id: "t3", direction: "out", amountUsd: Number.NaN }),
    ]);
    expect(totals).toMatchObject({ inUsd: 100, outUsd: 0, inCount: 2, outCount: 1, unpricedCount: 2 });
  });

  it("menghitung address EVM yang sama sebagai satu lawan transaksi", () => {
    const totals = summarizeFlow("ethereum", [
      transfer({}),
      transfer({ id: "t2", counterparty: "0xabc0000000000000000000000000000000000001" }),
    ]);
    expect(totals.counterpartyCount).toBe(1);
  });

  it("membedakan huruf besar/kecil address Solana", () => {
    expect(addressKey("solana", "AbC")).not.toBe(addressKey("solana", "abc"));
    expect(addressKey("ethereum", "0xAbC")).toBe(addressKey("ethereum", "0xabc"));
  });

  it("nol semua untuk address tanpa transfer", () => {
    expect(summarizeFlow("base", [])).toEqual({
      inUsd: 0,
      outUsd: 0,
      netUsd: 0,
      inCount: 0,
      outCount: 0,
      unpricedCount: 0,
      counterpartyCount: 0,
    });
  });
});

describe("lawan transaksi terbesar", () => {
  it("mengurutkan sumber dana dari nilai USD terbesar", () => {
    const sources = topCounterparties(funder.chain, funder.transfers, "in");
    expect(sources.map((item) => [item.label?.name ?? null, item.totalUsd, item.transferCount])).toEqual([
      ["Hot wallet exchange", 29_400, 1],
      ["Kemungkinan bundler", 17_694.6, 1],
      ["Kemungkinan bundler", 9_310, 1],
      ["Kemungkinan bundler", 7_105, 1],
      [null, 6_125, 2],
    ]);
    expect(sources[4]).toMatchObject({ unpricedCount: 1, assets: ["ETH", "XNEB"], lastAt: "2026-09-25T18:00:00.000Z" });
  });

  it("membatasi jumlah tujuan dana dan menggabungkan aset dari address yang sama", () => {
    const destinations = topCounterparties(funder.chain, funder.transfers, "out", 2);
    expect(destinations.map((item) => [item.label?.name, item.totalUsd])).toEqual([
      ["Deposit exchange", 15_060],
      ["Kemungkinan bundler", 5_390],
    ]);

    const deployer = MOCK_FLOWS.find((flow) => flow.chain === "ethereum" && flow.label?.type === "deployer")!;
    const pool = topCounterparties(deployer.chain, deployer.transfers, "out").find(
      (item) => item.label?.type === "liquidity_pool",
    );
    expect(pool).toMatchObject({ transferCount: 2, assets: ["ETH", "NBLA"], totalUsd: 24_490 });
  });

  it("mengurutkan transfer tanpa harga di belakang", () => {
    const result = topCounterparties("ethereum", [
      transfer({ counterparty: "0x01", amountUsd: undefined }),
      transfer({ id: "t2", counterparty: "0x02", amountUsd: 10 }),
    ], "in");
    expect(result.map((item) => item.address)).toEqual(["0x02", "0x01"]);
  });
});

describe("urutan transfer", () => {
  it("menaruh transfer terbaru di atas dan menjaga urutan di waktu yang sama", () => {
    const sorted = sortTransfersNewestFirst([
      transfer({ id: "a", timestamp: "2026-09-12T08:31:00.000Z" }),
      transfer({ id: "b", timestamp: "2026-09-20T00:00:00.000Z" }),
      transfer({ id: "c", timestamp: "2026-09-12T08:31:00.000Z" }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["b", "a", "c"]);
  });
});

describe("nama tampilan address", () => {
  it("memakai nama label, lalu jenis label, lalu keterangan tanpa label", () => {
    expect(addressTitle({ type: "exchange", name: "Hot wallet", source: "external", sourceName: "x" })).toBe("Hot wallet");
    expect(addressTitle({ type: "deployer", source: "heuristic", sourceName: "x" })).toBe("Deployer");
    expect(addressTitle(undefined)).toBe("Address tanpa label");
  });
});

describe("filter daftar dana masuk & keluar", () => {
  it("memisahkan dana masuk dan keluar beserta jumlah USD-nya", () => {
    const masuk = filterTransfers(funder.transfers, "in");
    const keluar = filterTransfers(funder.transfers, "out");
    expect([masuk.items.length, masuk.totalUsd, masuk.unpricedCount]).toEqual([6, 69_634.6, 1]);
    expect([keluar.items.length, keluar.totalUsd, keluar.unpricedCount]).toEqual([7, 44_060, 0]);
    expect(keluar.items.every((item) => item.direction === "out")).toBe(true);
  });

  it("tab semua memakai selisih yang sama dengan ringkasan", () => {
    const semua = filterTransfers(funder.transfers, "all");
    expect(semua.items).toHaveLength(13);
    expect(semua.totalUsd).toBe(summarizeFlow(funder.chain, funder.transfers).netUsd);
  });

  it("kosong untuk address tanpa transfer", () => {
    expect(filterTransfers([], "in")).toEqual({ items: [], totalUsd: 0, unpricedCount: 0 });
  });
});
