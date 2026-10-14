import { describe, expect, it } from "vitest";
import { MOCK_SETTINGS } from "./mock/settings";
import { dataSourceCounts, initials, settingsTabFromPath, SETTINGS_TABS, sortDataSources } from "./settings";

describe("pengaturan", () => {
  it("tiga tab dengan alamat sendiri; tab aktif dibaca dari path", () => {
    expect(SETTINGS_TABS.map((tab) => tab.href)).toEqual(["/pengaturan/profil", "/pengaturan/tampilan", "/pengaturan/sumber-data"]);
    expect(settingsTabFromPath("/pengaturan/tampilan")).toBe("tampilan");
    expect(settingsTabFromPath("/pengaturan/sumber-data/")).toBe("sumber-data");
    expect(settingsTabFromPath("/pengaturan")).toBeNull();
    expect(settingsTabFromPath("/pengaturan/lain")).toBeNull();
  });

  it("sumber data bermasalah tampil dulu, dengan hitungan per kondisi", () => {
    const sorted = sortDataSources(MOCK_SETTINGS.dataSources);
    expect(sorted.map((source) => source.status)).toEqual(["down", "degraded", "ok", "ok", "ok", "not_integrated"]);
    expect(dataSourceCounts(MOCK_SETTINGS.dataSources)).toEqual({ ok: 3, degraded: 1, down: 1, disabled: 0, not_integrated: 1 });
  });

  it("mock tidak membawa nilai rahasia: hanya nama environment variable dan status terisi", () => {
    for (const source of MOCK_SETTINGS.dataSources) {
      for (const env of source.envVars) expect(Object.keys(env).sort()).toEqual(["configured", "name", "purpose", "required"]);
    }
  });

  it("inisial avatar", () => {
    expect(initials("Rina Analis")).toBe("RA");
    expect(initials("  budi ")).toBe("BU");
    expect(initials("Andi Budi Citra")).toBe("AC");
    expect(initials("")).toBe("?");
  });
});
