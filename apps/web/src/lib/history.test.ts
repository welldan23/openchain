import { describe, expect, it } from "vitest";
import { groupHistoryByDay, NOTE_MAX_LENGTH, validateNote } from "./history";
import type { InvestigationEntry } from "./types";

const entry = (id: string, openedAt: string): InvestigationEntry => ({ id, kind: "token", title: id, href: `/${id}`, openedAt });

describe("riwayat per hari", () => {
  it("mengelompokkan per tanggal WIB dengan label hari ini dan kemarin", () => {
    // 03 Okt 2026 12.00 WIB
    const now = new Date("2026-10-03T05:00:00.000Z");
    const groups = groupHistoryByDay(
      [
        entry("lama", "2026-09-28T10:00:00.000Z"),
        entry("pagi", "2026-10-03T00:30:00.000Z"),
        // 02 Okt 23.30 WIB: masih kemarin meski di UTC sudah tanggal 2 sore.
        entry("malam", "2026-10-02T16:30:00.000Z"),
        // 03 Okt 00.30 WIB: sudah hari ini meski di UTC masih tanggal 2.
        entry("tengah-malam", "2026-10-02T17:30:00.000Z"),
      ],
      now,
    );
    expect(groups.map((group) => [group.label, group.entries.map((item) => item.id)])).toEqual([
      ["Hari ini", ["pagi", "tengah-malam"]],
      ["Kemarin", ["malam"]],
      ["Senin, 28 September 2026", ["lama"]],
    ]);
    expect(groups[0].day).toBe("2026-10-03");
  });
});

describe("catatan investigasi", () => {
  it("merapikan spasi; catatan kosong berarti dihapus", () => {
    expect(validateNote("  cek lagi besok  ")).toEqual({ ok: true, note: "cek lagi besok" });
    expect(validateNote("   ")).toEqual({ ok: true, note: undefined });
  });

  it("menolak catatan terlalu panjang tanpa memotongnya diam-diam", () => {
    expect(validateNote("a".repeat(NOTE_MAX_LENGTH))).toEqual({ ok: true, note: "a".repeat(NOTE_MAX_LENGTH) });
    const result = validateNote("a".repeat(NOTE_MAX_LENGTH + 5));
    expect(result).toEqual({ ok: false, error: `Catatan maksimal ${NOTE_MAX_LENGTH} karakter (sekarang ${NOTE_MAX_LENGTH + 5}).` });
  });
});
