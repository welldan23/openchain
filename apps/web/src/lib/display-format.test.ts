import { describe, expect, it } from "vitest";
import { formatAmount, formatDateTimeIn, formatValue, PREVIEW_SAMPLE, timeZoneLabel, timeZoneOf } from "./display-format";

const id = { numberLocale: "id" as const, compactNumbers: false, timeDisplay: "local" as const, valueUnit: "usd" as const };
const en = { ...id, numberLocale: "en" as const };

describe("format sesuai preferensi", () => {
  it("angka: pemisah Indonesia atau internasional, penuh atau ringkas", () => {
    expect(formatAmount(1_234_567.89, id)).toBe("1.234.567,89");
    expect(formatAmount(1_234_567.89, en)).toBe("1,234,567.89");
    expect(formatAmount(1_234_567, { ...id, compactNumbers: true })).toBe("1,23\u00a0jt");
    expect(formatAmount(1_234_567, { ...en, compactNumbers: true })).toBe("1.23M");
    expect(formatAmount(Number.NaN, id)).toBe("–");
  });

  it("waktu: zona profil dengan singkatan Indonesia, atau UTC", () => {
    expect(formatDateTimeIn(PREVIEW_SAMPLE.at, id, "Asia/Jakarta")).toBe("03 Okt 2026, 11.30 WIB");
    expect(formatDateTimeIn(PREVIEW_SAMPLE.at, { ...id, timeDisplay: "utc" }, "Asia/Jakarta")).toBe("03 Okt 2026, 04.30 UTC");
    expect(formatDateTimeIn(PREVIEW_SAMPLE.at, en, "Asia/Makassar")).toBe("Oct 03, 2026, 12:30 WITA");
    expect(timeZoneOf({ timeDisplay: "utc" }, "Asia/Jayapura")).toBe("UTC");
    expect(timeZoneLabel("Asia/Jayapura")).toBe("WIT");
    expect(timeZoneLabel("Asia/Tokyo")).toBe("GMT+9");
    expect(formatDateTimeIn("bukan tanggal", id, "Asia/Jakarta")).toBe("–");
  });

  it("satuan nilai: USD atau koin native; transfer tanpa jumlah native tetap USD dan diberi tanda", () => {
    expect(formatValue(PREVIEW_SAMPLE.transfer, id)).toBe("US$4.215,30");
    expect(formatValue(PREVIEW_SAMPLE.transfer, { ...id, valueUnit: "native" })).toBe("1,5 ETH");
    expect(formatValue(PREVIEW_SAMPLE.transfer, { ...en, valueUnit: "native" })).toBe("1.5 ETH");
    expect(formatValue(PREVIEW_SAMPLE.tokenTransfer, { ...id, valueUnit: "native" })).toBe("US$980,25 (tanpa jumlah koin native)");
    expect(formatValue({ usd: null, native: null }, id)).toBe("–");
  });
});
