import { describe, expect, it } from "vitest";
import {
  CLASSIFICATION_META,
  CLASSIFICATION_ORDER,
  DANGER_STATUS_META,
  INFO_CLASSIFICATION_ORDER,
  RISK_LEVEL_META,
  RISK_TONES,
  SEVERITY_META,
} from "./labels";

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

describe("nada tingkat risiko", () => {
  it("tingkat risiko dan keparahan yang setara memakai warna yang sama persis", () => {
    for (const key of ["critical", "high", "medium", "low"] as const) {
      expect(SEVERITY_META[key].className, key).toBe(RISK_LEVEL_META[key].className);
      expect(SEVERITY_META[key].tone, key).toBe(RISK_LEVEL_META[key].tone);
      expect(RISK_LEVEL_META[key].barClass, key).toBe(RISK_TONES[key].barClass);
    }
    expect(SEVERITY_META.info.className).toBe(RISK_LEVEL_META.unknown.className);
  });

  it("setiap nada punya warna berbeda dan tidak ada warna di luar nada", () => {
    const classes = Object.values(RISK_TONES).map((tone) => tone.className);
    expect(new Set(classes).size).toBe(classes.length);
    for (const meta of [...Object.values(SEVERITY_META), ...Object.values(RISK_LEVEL_META)]) {
      expect(classes).toContain(meta.className);
    }
    expect(DANGER_STATUS_META.detected.className).toBe(RISK_TONES.high.textClass);
    expect(DANGER_STATUS_META.clear.className).toBe(RISK_TONES.low.textClass);
  });
});
