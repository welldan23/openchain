import { describe, expect, it } from "vitest";
import {
  classifyQuery,
  dedupeResults,
  describeResultMeta,
  diagnoseQuery,
  highlightMatch,
  investigationFromResult,
  investigationKindOf,
  moveActiveIndex,
  normalizeText,
  parseResultKindFilter,
  withSearchOrigin,
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

  it("membaca filter jenis dari URL", () => {
    expect(parseResultKindFilter("token")).toBe("token");
    expect(parseResultKindFilter("aneh")).toBe("all");
    expect(parseResultKindFilter(undefined)).toBe("all");
  });
});

describe("diagnosa isian", () => {
  it("menjelaskan address atau hash yang terpotong", () => {
    expect(diagnoseQuery(`0x${"ab".repeat(15)}`)).toMatch(/32 karakter, padahal address EVM 42/);
    expect(diagnoseQuery(`0x${"ab".repeat(25)}`)).toMatch(/terlalu panjang untuk address EVM/);
    expect(diagnoseQuery(`0x${"ab".repeat(40)}`)).toMatch(/lebih panjang dari hash transaksi/);
    expect(diagnoseQuery(`0x${"zz".repeat(20)}`)).toMatch(/bukan address atau hash EVM/);
    expect(diagnoseQuery("0xabcdef12 34567890")).toMatch(/spasi/);
    expect(diagnoseQuery("gfiT3SHJHGgq2bhMnP3HqRaV8")).toMatch(/Address Solana 32–44/);
  });

  it("diam untuk isian yang wajar", () => {
    expect(diagnoseQuery("nebula")).toBeNull();
    expect(diagnoseQuery("0x12")).toBeNull();
    expect(diagnoseQuery(`0x${"ab".repeat(20)}`)).toBeNull();
    expect(diagnoseQuery("")).toBeNull();
  });
});

describe("dari hasil ke halaman investigasi", () => {
  const result = (over: Partial<SearchResult>): SearchResult => ({
    id: "r",
    kind: "address",
    title: "Pendana",
    subtitle: "",
    href: "/flow/ethereum/0xabc",
    matchedBy: "",
    ...over,
  });

  it("membawa kata kunci ke tautan, sebelum hash bukti dan bersama parameter lain", () => {
    expect(withSearchOrigin("/flow/ethereum/0xabc", " nebula finance ")).toBe("/flow/ethereum/0xabc?cari=nebula+finance");
    expect(withSearchOrigin("/flow/ethereum/0xabc#bukti-0x1", "0x1")).toBe("/flow/ethereum/0xabc?cari=0x1#bukti-0x1");
    expect(withSearchOrigin("/map/ethereum/0xabc?lapisan=kelompok", "nbla")).toBe("/map/ethereum/0xabc?lapisan=kelompok&cari=nbla");
    expect(withSearchOrigin("/token/ethereum/0xabc", "  ")).toBe("/token/ethereum/0xabc");
  });

  it("memetakan jenis hasil ke jenis halaman investigasi", () => {
    expect(investigationKindOf(result({ kind: "token" }))).toBe("token");
    expect(investigationKindOf(result({ kind: "transaction" }))).toBe("flow");
    expect(investigationKindOf(result({ meta: { kind: "address", view: "flow", txCount: 1, activeChains: [] } }))).toBe("flow");
    expect(investigationKindOf(result({ meta: { kind: "address", view: "multichain", txCount: 1, activeChains: [] } }))).toBe("multichain");
    expect(investigationFromResult(result({ chain: "base" }))).toEqual({ kind: "flow", title: "Pendana", chain: "base", href: "/flow/ethereum/0xabc" });
    expect(investigationFromResult(result({}))).not.toHaveProperty("chain");
  });
});
