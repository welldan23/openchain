import { describe, expect, it } from "vitest";
import {
  classifyQuery,
  countResultsByKind,
  dedupeResults,
  describeResultMeta,
  highlightMatch,
  moveActiveIndex,
  normalizeText,
  parseResultKindFilter,
} from "./search";
import type { SearchResult } from "./types";

describe("jenis isian pencarian", () => {
  it("mengenali address, hash, dan teks", () => {
    expect(classifyQuery("   ")).toBe("empty");
    expect(classifyQuery(`0x${"aB".repeat(20)}`)).toBe("evm_address");
    expect(classifyQuery(`  0x${"ab".repeat(32)} `)).toBe("evm_tx");
    expect(classifyQuery("gfiT3SHJHGgq2bhMnP3HqRaV8dhMDvyqtvCvLok3sXPg")).toBe("solana_address");
    expect(classifyQuery("5".repeat(88))).toBe("solana_tx");
    expect(classifyQuery("NBLA")).toBe("text");
    expect(classifyQuery("0x1234")).toBe("text");
    expect(classifyQuery("nebula finance")).toBe("text");
  });

  it("menormalkan teks dan merapikan hasil ganda", () => {
    expect(normalizeText("  Nebula   FINANCE ")).toBe("nebula finance");
    const result = (id: string, kind: SearchResult["kind"], href: string): SearchResult => ({
      id,
      kind,
      title: id,
      subtitle: "",
      href,
      matchedBy: "",
    });
    expect(
      dedupeResults([result("tx", "transaction", "/a#1"), result("addr", "address", "/b"), result("dup", "address", "/b"), result("tok", "token", "/c")]).map(
        (item) => item.id,
      ),
    ).toEqual(["tok", "addr", "tx"]);
  });
});

describe("bantuan kolom saran", () => {
  it("menandai bagian yang cocok tanpa peduli huruf besar/kecil", () => {
    expect(highlightMatch("Nebula Finance", "fin")).toEqual([
      { text: "Nebula ", match: false },
      { text: "Fin", match: true },
      { text: "ance", match: false },
    ]);
    expect(highlightMatch("Nebula Finance", "  NEBULA  ")).toEqual([
      { text: "Nebula", match: true },
      { text: " Finance", match: false },
    ]);
    expect(highlightMatch("Kodo Cat", "xyz")).toEqual([{ text: "Kodo Cat", match: false }]);
    expect(highlightMatch("Kodo Cat", "")).toEqual([{ text: "Kodo Cat", match: false }]);
  });

  it("memindah sorotan dan berputar di ujung", () => {
    expect(moveActiveIndex(-1, 1, 3)).toBe(0);
    expect(moveActiveIndex(-1, -1, 3)).toBe(2);
    expect(moveActiveIndex(2, 1, 3)).toBe(0);
    expect(moveActiveIndex(0, -1, 3)).toBe(2);
    expect(moveActiveIndex(1, 1, 3)).toBe(2);
    expect(moveActiveIndex(0, 1, 0)).toBe(-1);
  });
});

describe("metadata hasil pencarian", () => {
  const now = new Date("2026-10-03T12:00:00.000Z");

  it("menulis data pasar yang belum ada sebagai 'Belum ada data', bukan nol", () => {
    const items = describeResultMeta(
      { kind: "token", riskLevel: "unknown", findingCount: 0, verified: false, deployedAt: "2026-10-03T04:18:00.000Z" },
      now,
    );
    expect(items.map((item) => [item.id, item.value])).toEqual([
      ["market", "Belum ada data"],
      ["findings", "0"],
      ["deployed", "7 jam yang lalu"],
    ]);
  });

  it("merangkum address dan transaksi", () => {
    const address = describeResultMeta(
      { kind: "address", view: "flow", txCount: 13, inUsd: 1200, activeChains: ["ethereum"], lastSeen: "2026-10-01T12:00:00.000Z" },
      now,
    );
    expect(address.find((item) => item.id === "tx")).toMatchObject({ label: "Transfer", value: "13" });
    expect(address.find((item) => item.id === "out")?.value).toBe("Belum ada data");
    expect(address.find((item) => item.id === "last")?.value).toBe("kemarin dulu");

    const tx = describeResultMeta(
      {
        kind: "transaction",
        direction: "out",
        amount: 2,
        assetSymbol: "ETH",
        timestamp: "2026-10-03T11:00:00.000Z",
        counterparty: `0x${"ab".repeat(20)}`,
      },
      now,
    );
    expect(tx.find((item) => item.id === "value")?.value).toBe("Harga tidak diketahui");
    expect(tx.find((item) => item.id === "counterparty")).toMatchObject({ label: "Ke", value: "0xabab…abab" });
  });

  it("membaca filter jenis dan menghitung hasil per jenis", () => {
    expect(parseResultKindFilter("token")).toBe("token");
    expect(parseResultKindFilter("aneh")).toBe("all");
    expect(parseResultKindFilter(undefined)).toBe("all");
    const result = (kind: SearchResult["kind"]): SearchResult => ({ id: kind, kind, title: "", subtitle: "", href: "", matchedBy: "" });
    expect(countResultsByKind([result("token"), result("address"), result("address")])).toEqual({
      all: 3,
      token: 1,
      address: 2,
      transaction: 0,
    });
  });
});
