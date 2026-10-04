import { describe, expect, it } from "vitest";
import { RISK_LEVEL_ICONS, RISK_TONE_ICONS, SEVERITY_ICONS } from "./risk-icons";

describe("ikon tingkat risiko", () => {
  it("tingkat risiko dan keparahan yang setara memakai ikon yang sama", () => {
    for (const key of ["critical", "high", "medium", "low"] as const) {
      expect(RISK_LEVEL_ICONS[key], key).toBe(SEVERITY_ICONS[key]);
    }
  });

  it("setiap tingkat punya bentuk ikon berbeda, supaya tidak bergantung warna", () => {
    const icons = [...Object.values(RISK_TONE_ICONS), RISK_LEVEL_ICONS.unknown, SEVERITY_ICONS.info];
    expect(new Set(icons).size).toBe(icons.length);
  });
});
