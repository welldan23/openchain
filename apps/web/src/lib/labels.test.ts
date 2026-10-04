import { describe, expect, it } from "vitest";
import { CLASSIFICATION_META, CLASSIFICATION_ORDER, INFO_CLASSIFICATION_ORDER } from "./labels";

describe("jenis informasi", () => {
  it("legenda memuat semua jenis, klasifikasi temuan dulu lalu data tidak tersedia", () => {
    expect(INFO_CLASSIFICATION_ORDER).toEqual([...CLASSIFICATION_ORDER, "unavailable"]);
    expect(new Set(INFO_CLASSIFICATION_ORDER)).toEqual(new Set(Object.keys(CLASSIFICATION_META)));
  });

  it("setiap jenis punya label, arti, dan cara mengecek", () => {
    for (const key of INFO_CLASSIFICATION_ORDER) {
      const meta = CLASSIFICATION_META[key];
      expect(meta.label.length, key).toBeGreaterThan(0);
      expect(meta.description.length, key).toBeGreaterThan(20);
      expect(meta.howToCheck.length, key).toBeGreaterThan(20);
    }
  });
});
