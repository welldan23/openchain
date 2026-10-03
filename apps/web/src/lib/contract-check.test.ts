import { describe, expect, it } from "vitest";
import {
  countContractChecks,
  describeContractChecks,
  sortContractChecks,
} from "./contract-check";
import { MOCK_TOKENS } from "./mock/tokens";
import type { ContractCheckItem, ContractCheckStatus } from "./types";

function check(id: string, status: ContractCheckStatus): ContractCheckItem {
  return { id, label: id, status, value: "-", evidenceTxHashes: [] };
}

describe("cek kontrak", () => {
  const items = [
    check("a", "pass"),
    check("b", "warn"),
    check("c", "fail"),
    check("d", "unknown"),
    check("e", "warn"),
  ];

  it("mengurutkan yang bermasalah dulu dan menjaga urutan asli per status", () => {
    expect(sortContractChecks(items).map((item) => item.id)).toEqual(["c", "b", "e", "d", "a"]);
    expect(items.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("merekap jumlah per status", () => {
    expect(countContractChecks(items)).toEqual([
      { status: "fail", count: 1 },
      { status: "warn", count: 2 },
      { status: "unknown", count: 1 },
      { status: "pass", count: 1 },
    ]);
    expect(describeContractChecks(items)).toBe(
      "1 berisiko, 2 perlu perhatian, 1 belum dicek, 1 lolos",
    );
    expect(countContractChecks([])).toEqual([]);
  });
});

describe("konsistensi data tiruan cek kontrak", () => {
  it("setiap bukti cek kontrak merujuk ke transaksi yang dikenal halaman", () => {
    for (const item of MOCK_TOKENS) {
      const known = new Set([
        item.token.deployTxHash,
        ...item.evidence.map((entry) => entry.txHash),
        ...item.activity.map((entry) => entry.txHash),
      ]);
      for (const entry of item.contract.items) {
        for (const hash of entry.evidenceTxHashes) {
          expect(known.has(hash), `${item.token.symbol}: ${entry.id}`).toBe(true);
        }
      }
    }
  });

  it("pemeriksaan yang belum dicek tidak membawa tag klasifikasi", () => {
    for (const item of MOCK_TOKENS) {
      for (const entry of item.contract.items) {
        if (entry.status === "unknown") expect(entry.classification).toBeUndefined();
        else expect(entry.classification).toBeDefined();
      }
    }
  });
});
