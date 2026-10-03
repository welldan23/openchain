import { describe, expect, it } from "vitest";
import {
  activeFilterChips,
  applySearchFilters,
  EMPTY_SEARCH_FILTERS,
  filterRelaxations,
  isSearchFiltered,
  parseSearchFilters,
  searchFacets,
  searchFilterHref,
  toggleListItem,
} from "./search-filter";
import type { SearchResult } from "./types";

const exchange = { type: "exchange", name: "Bursa", source: "external", sourceName: "Etherscan" } as const;
const bot = { type: "bot", source: "heuristic", sourceName: "OpenChain heuristic" } as const;

const RESULTS: SearchResult[] = [
  { id: "tok-eth", kind: "token", title: "A", subtitle: "", chain: "ethereum", href: "/t1", matchedBy: "" },
  { id: "tok-sol", kind: "token", title: "B", subtitle: "", chain: "solana", href: "/t2", matchedBy: "" },
  { id: "addr-eth", kind: "address", title: "C", subtitle: "", chain: "ethereum", label: exchange, href: "/a1", matchedBy: "" },
  {
    id: "addr-multi",
    kind: "address",
    title: "D",
    subtitle: "",
    label: bot,
    href: "/a2",
    matchedBy: "",
    meta: { kind: "address", view: "multichain", txCount: 3, activeChains: ["ethereum", "base"] },
  },
  { id: "tx-base", kind: "transaction", title: "E", subtitle: "", chain: "base", href: "/x", matchedBy: "" },
];

const ids = (results: SearchResult[]) => results.map((result) => result.id);

describe("filter hasil pencarian", () => {
  it("membaca dan menulis filter di URL, mengabaikan nilai asing", () => {
    const filters = parseSearchFilters({ jenis: "address", jaringan: "base,ethereum,mars,base", label: "bot,aneh,none", sumber: "dugaan" });
    expect(filters).toEqual({ kind: "address", chains: ["base", "ethereum"], labels: ["bot", "none"], source: "heuristic" });
    expect(searchFilterHref("nbla", filters)).toBe("/cari?q=nbla&jenis=address&jaringan=base%2Cethereum&label=bot%2Cnone&sumber=dugaan");
    expect(searchFilterHref("nbla", EMPTY_SEARCH_FILTERS)).toBe("/cari?q=nbla");
    expect(parseSearchFilters({})).toEqual(EMPTY_SEARCH_FILTERS);
    expect(isSearchFiltered(EMPTY_SEARCH_FILTERS)).toBe(false);
    expect(isSearchFiltered(filters)).toBe(true);
    expect(toggleListItem(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleListItem(["a"], "b")).toEqual(["a", "b"]);
  });

  it("menyaring per jaringan, termasuk address multichain yang aktif di beberapa chain", () => {
    expect(ids(applySearchFilters(RESULTS, { ...EMPTY_SEARCH_FILTERS, chains: ["base"] }))).toEqual(["addr-multi", "tx-base"]);
    expect(ids(applySearchFilters(RESULTS, { ...EMPTY_SEARCH_FILTERS, chains: ["solana", "base"], kind: "token" }))).toEqual(["tok-sol"]);
  });

  it("menyaring per label dan sumber; hasil tanpa label ikut tersaring saat sumber dipilih", () => {
    expect(ids(applySearchFilters(RESULTS, { ...EMPTY_SEARCH_FILTERS, labels: ["none"] }))).toEqual(["tok-eth", "tok-sol", "tx-base"]);
    expect(ids(applySearchFilters(RESULTS, { ...EMPTY_SEARCH_FILTERS, source: "external" }))).toEqual(["addr-eth"]);
  });

  it("menghitung jumlah tiap pilihan dengan filter lain tetap berlaku", () => {
    const facets = searchFacets(RESULTS, { ...EMPTY_SEARCH_FILTERS, kind: "address", chains: ["ethereum"] });
    // Jenis dihitung dengan filter jaringan: token Solana dan transaksi Base tidak ikut.
    expect(facets.kinds).toEqual({ all: 3, token: 1, address: 2, transaction: 0 });
    // Jaringan dihitung dengan filter jenis address; Solana tetap tampil sebagai pilihan.
    expect(facets.chains).toEqual([
      { chain: "ethereum", count: 2 },
      { chain: "solana", count: 0 },
      { chain: "base", count: 1 },
    ]);
    expect(facets.labels).toEqual([
      { key: "bot", count: 1 },
      { key: "exchange", count: 1 },
      { key: "none", count: 0 },
    ]);
    expect(facets.sources).toEqual({ all: 2, external: 1, heuristic: 1 });
  });
});

describe("chip filter aktif", () => {
  const filters = { kind: "address", chains: ["solana", "base"], labels: ["exchange"], source: "external" } as const satisfies Parameters<
    typeof activeFilterChips
  >[0];

  it("membuat satu chip per pilihan; membuang chip hanya melepas pilihan itu", () => {
    const chips = activeFilterChips({ ...filters, chains: [...filters.chains], labels: [...filters.labels] });
    expect(chips.map((chip) => `${chip.group}: ${chip.value}`)).toEqual([
      "Jenis: Address",
      "Jaringan: Solana",
      "Jaringan: Base",
      "Label: Exchange",
      "Sumber: Label eksternal",
    ]);
    expect(chips[1].without.chains).toEqual(["base"]);
    expect(chips[0].without).toMatchObject({ kind: "all", chains: ["solana", "base"] });
    expect(activeFilterChips(EMPTY_SEARCH_FILTERS)).toEqual([]);
  });

  it("menyarankan chip yang bila dibuang memunculkan hasil", () => {
    // Tidak ada address di Solana. Buang jenis → token Solana muncul; buang jaringan → dua address muncul.
    const strict = { kind: "address", chains: ["solana"], labels: [], source: "all" } as Parameters<typeof activeFilterChips>[0];
    const relax = filterRelaxations(RESULTS, strict);
    expect(applySearchFilters(RESULTS, strict)).toEqual([]);
    expect(relax.map((item) => [item.chip.id, item.count])).toEqual([
      ["jaringan:solana", 2],
      ["jenis:address", 1],
    ]);
  });
});
