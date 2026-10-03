import { describe, expect, it } from "vitest";
import { classifyQuery, dedupeResults, normalizeText } from "./search";
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
