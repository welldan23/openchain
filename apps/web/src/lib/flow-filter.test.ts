import { describe, expect, it } from "vitest";
import {
  describeRange,
  filterByTime,
  firstParam,
  flowEmptyKind,
  flowFilterHref,
  resolveTimeFilter,
  wibDateValue,
} from "./flow-filter";
import { MOCK_FLOWS } from "./mock/flows";

const funder = MOCK_FLOWS[0];
const window = funder.window; // 12 Sep 2026 00.00 UTC – 03 Okt 2026 04.30 UTC

describe("rentang waktu dari query URL", () => {
  it("tanpa filter memakai seluruh periode data", () => {
    expect(resolveTimeFilter({}, window)).toEqual({ preset: "semua", from: window.from, to: window.to });
  });

  it("preset dihitung mundur dari akhir periode, bukan dari jam sekarang", () => {
    expect(resolveTimeFilter({ rentang: "7h" }, window)).toEqual({
      preset: "7h",
      from: "2026-09-26T04:30:00.000Z",
      to: window.to,
    });
    expect(resolveTimeFilter({ rentang: "24j" }, window).from).toBe("2026-10-02T04:30:00.000Z");
  });

  it("preset yang lebih panjang dari periode data dipotong di awal periode", () => {
    expect(resolveTimeFilter({ rentang: "30h" }, window).from).toBe(window.from);
  });

  it("tanggal pilihan sendiri dibaca sebagai hari penuh WIB", () => {
    expect(resolveTimeFilter({ dari: "2026-09-20", sampai: "2026-09-22" }, window)).toEqual({
      preset: null,
      from: "2026-09-19T17:00:00.000Z",
      to: "2026-09-22T16:59:59.999Z",
      customFrom: "2026-09-20",
      customTo: "2026-09-22",
    });
  });

  it("tanggal di luar periode data dipotong ke batas periode", () => {
    const result = resolveTimeFilter({ dari: "2026-01-01" }, window);
    expect([result.from, result.to]).toEqual([window.from, window.to]);
  });

  it("input tidak valid kembali ke semua transfer dengan pesan", () => {
    expect(resolveTimeFilter({ rentang: "1tahun" }, window)).toMatchObject({ preset: "semua", notice: expect.stringMatching(/rentang/) });
    expect(resolveTimeFilter({ dari: "20-09-2026" }, window)).toMatchObject({ preset: "semua", notice: expect.stringMatching(/tanggal/) });
    expect(resolveTimeFilter({ dari: "2026-02-31" }, window)).toMatchObject({ preset: "semua", notice: expect.any(String) });
    expect(resolveTimeFilter({ dari: "2026-09-22", sampai: "2026-09-20" }, window)).toMatchObject({
      preset: "semua",
      notice: expect.stringMatching(/setelah/),
    });
  });
});

describe("transfer di dalam rentang", () => {
  it("menyaring transfer menurut waktu, batasnya ikut", () => {
    const lastWeek = filterByTime(funder.transfers, resolveTimeFilter({ rentang: "7h" }, window));
    expect(lastWeek.map((item) => item.timestamp)).toEqual([]);
    const sept20to22 = filterByTime(funder.transfers, resolveTimeFilter({ dari: "2026-09-20", sampai: "2026-09-22" }, window));
    expect(sept20to22).toHaveLength(5);
    const exact = filterByTime(funder.transfers, { from: "2026-09-12T07:20:00.000Z", to: "2026-09-12T07:20:00.000Z" });
    expect(exact).toHaveLength(1);
  });
});

describe("tautan dan teks filter", () => {
  it("menulis hanya parameter yang terisi", () => {
    expect(flowFilterHref("base", "0xabc", { rentang: "7h" })).toBe("/flow/base/0xabc?rentang=7h");
    expect(flowFilterHref("base", "0xabc", { dari: "2026-09-20", sampai: undefined })).toBe(
      "/flow/base/0xabc?dari=2026-09-20",
    );
    expect(flowFilterHref("base", "0xabc", {})).toBe("/flow/base/0xabc");
  });

  it("membaca nilai pertama query dan menulis rentang tanggal", () => {
    expect(firstParam(["7h", "30h"])).toBe("7h");
    expect(firstParam(undefined)).toBeUndefined();
    expect(describeRange({ from: window.from, to: window.to })).toBe("12 Sep 2026 – 03 Okt 2026 (WIB)");
  });
});

describe("tanggal input", () => {
  it("memakai tanggal WIB, bukan UTC", () => {
    expect(wibDateValue("2026-09-19T17:00:00.000Z")).toBe("2026-09-20");
    expect(wibDateValue("2026-10-03T04:30:00.000Z")).toBe("2026-10-03");
  });
});

describe("alasan daftar kosong", () => {
  it("membedakan address tanpa transfer dan hasil filter kosong", () => {
    expect(flowEmptyKind(0, 0)).toBe("no-data");
    expect(flowEmptyKind(13, 0)).toBe("filtered");
    expect(flowEmptyKind(13, 5)).toBeNull();
  });
});
