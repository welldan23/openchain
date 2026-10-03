import { describe, expect, it } from "vitest";
import {
  EMPTY_VALUE,
  formatAge,
  formatDate,
  formatDateTime,
  formatNumber,
  formatNumberCompact,
  formatPct,
  formatPctChange,
  formatRelativeTime,
  formatTokenAmount,
  formatUsd,
  formatUsdCompact,
  formatUsdPrice,
  shortenHash,
} from "./format";

/** Intl memakai spasi tak terputus; samakan dengan spasi biasa untuk assert. */
const plain = (value: string) => value.replace(/[  ]/g, " ");

describe("angka", () => {
  it("memakai titik sebagai pemisah ribuan", () => {
    expect(formatNumber(23_512_880)).toBe("23.512.880");
    expect(formatNumber(1234.567, 2)).toBe("1.234,57");
  });

  it("meringkas angka besar dengan rb/jt/M/T", () => {
    expect(plain(formatNumberCompact(1_250))).toBe("1,25 rb");
    expect(plain(formatNumberCompact(1_250_000))).toBe("1,25 jt");
    expect(plain(formatNumberCompact(1_000_000_000))).toBe("1 M");
    expect(plain(formatNumberCompact(1_500_000_000_000))).toBe("1,5 T");
    expect(plain(formatNumberCompact(-3_400_000))).toBe("-3,4 jt");
    expect(formatNumberCompact(999)).toBe("999");
  });

  it("menampilkan jumlah token beserta simbol tanpa terpisah baris", () => {
    expect(formatTokenAmount(1_250_000, "NBLA")).toBe("1,25 jt NBLA");
    expect(plain(formatTokenAmount(999_850_000, "KODO", { compact: false }))).toBe(
      "999.850.000 KODO",
    );
  });
});

describe("uang", () => {
  it("memformat USD lengkap dan ringkas", () => {
    expect(formatUsd(5_266.25)).toBe("US$5.266,25");
    expect(plain(formatUsdCompact(4_213_000))).toBe("US$4,21 jt");
  });

  it("tidak menampilkan nol desimal yang tidak perlu pada USD ringkas", () => {
    expect(plain(formatUsdCompact(612_400))).toBe("US$612,4 rb");
    expect(plain(formatUsdCompact(5_000))).toBe("US$5 rb");
  });

  it("memakai digit signifikan untuk harga token kecil", () => {
    expect(formatUsdPrice(0.004213)).toBe("US$0,004213");
    expect(formatUsdPrice(0.00008731)).toBe("US$0,00008731");
    expect(formatUsdPrice(1.5)).toBe("US$1,50");
    expect(formatUsdPrice(0)).toBe("US$0,00");
  });
});

describe("persen", () => {
  it("menerima nilai dalam satuan persen", () => {
    expect(formatPct(18.4)).toBe("18,4%");
    expect(formatPct(61.8)).toBe("61,8%");
    expect(formatPct(100)).toBe("100%");
    expect(formatPct(0)).toBe("0%");
  });

  it("menandai nilai positif yang terlalu kecil agar tidak terbaca nol", () => {
    expect(formatPct(0.004)).toBe("<0,01%");
    expect(formatPct(0.04, { maximumFractionDigits: 1 })).toBe("<0,1%");
    expect(formatPct(0.01)).toBe("0,01%");
  });

  it("menampilkan tanda pada perubahan persen, kecuali nol", () => {
    expect(formatPctChange(12.4)).toBe("+12,4%");
    expect(formatPctChange(-8.7)).toBe("-8,7%");
    expect(formatPctChange(0)).toBe("0%");
  });
});

describe("waktu", () => {
  const snapshotAt = "2026-10-03T04:30:00.000Z";

  it("memakai zona waktu WIB", () => {
    expect(formatDateTime(snapshotAt)).toBe("03 Okt 2026, 11.30 WIB");
    expect(formatDate("2026-09-12T20:00:00.000Z")).toBe("13 Sep 2026");
  });

  it("menghitung umur relatif terhadap waktu snapshot", () => {
    expect(formatAge("2026-09-12T08:14:00.000Z", snapshotAt)).toBe("20 hari");
    expect(formatAge("2026-10-03T04:00:00.000Z", snapshotAt)).toBe("30 menit");
    expect(formatAge("2026-10-02T04:30:00.000Z", snapshotAt)).toBe("24 jam");
    expect(formatAge(snapshotAt, "2026-10-01T00:00:00.000Z")).toBe("0 menit");
  });

  it("menulis waktu relatif dalam bahasa Indonesia", () => {
    const now = new Date("2026-10-03T05:30:00.000Z");
    expect(formatRelativeTime(snapshotAt, now)).toBe("1 jam yang lalu");
    expect(formatRelativeTime("2026-10-03T05:15:00.000Z", now)).toBe("15 menit yang lalu");
    expect(formatRelativeTime("2026-09-30T05:30:00.000Z", now)).toBe("3 hari yang lalu");
    expect(formatRelativeTime("2026-10-03T05:29:40.000Z", now)).toBe("baru saja");
  });
});

describe("nilai tidak valid", () => {
  it("menampilkan placeholder alih-alih NaN atau Invalid Date", () => {
    expect(formatNumber(Number.NaN)).toBe(EMPTY_VALUE);
    expect(formatNumberCompact(Number.POSITIVE_INFINITY)).toBe(EMPTY_VALUE);
    expect(formatUsdPrice(Number.NaN)).toBe(EMPTY_VALUE);
    expect(formatPct(Number.NaN)).toBe(EMPTY_VALUE);
    expect(formatTokenAmount(Number.NaN, "NBLA")).toBe(EMPTY_VALUE);
    expect(formatDateTime("bukan-tanggal")).toBe(EMPTY_VALUE);
    expect(formatAge("bukan-tanggal", "2026-10-03T04:30:00.000Z")).toBe(EMPTY_VALUE);
    expect(formatRelativeTime("bukan-tanggal")).toBe(EMPTY_VALUE);
  });
});

describe("hash", () => {
  it("memendekkan address panjang dan membiarkan yang pendek", () => {
    expect(shortenHash("0x86c8862ba06befeed8bc12d165a430166395d5a3")).toBe("0x86c8…d5a3");
    expect(shortenHash("0xabc")).toBe("0xabc");
  });
});

describe("jumlah token dengan desimal pilihan", () => {
  it("menampilkan selisih kecil bila diminta lebih banyak desimal", () => {
    expect(formatTokenAmount(1.4985, "ETH", { compact: false })).toBe("1,5\u00a0ETH");
    expect(formatTokenAmount(1.4985, "ETH", { compact: false, maximumFractionDigits: 6 })).toBe("1,4985\u00a0ETH");
  });
});
