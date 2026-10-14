import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, parseThemePreference, resolveTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme";

describe("tema", () => {
  it("pilihan tersimpan dibaca aman; isi tak dikenal kembali ke tema gelap bawaan", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("ungu")).toBe(DEFAULT_THEME);
    expect(parseThemePreference(null)).toBe("dark");
  });

  it("system mengikuti perangkat", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("skrip awal memasang tema yang sama dengan aturan di atas", () => {
    const run = (stored: string | null, prefersLight: boolean) => {
      const dataset: Record<string, string> = {};
      const fn = new Function("localStorage", "matchMedia", "document", THEME_INIT_SCRIPT);
      fn({ getItem: (key: string) => (key === THEME_STORAGE_KEY ? stored : null) }, () => ({ matches: prefersLight }), { documentElement: { dataset } });
      return dataset.theme;
    };
    expect(run(null, true)).toBe("dark");
    expect(run("light", false)).toBe("light");
    expect(run("system", true)).toBe("light");
    expect(run("system", false)).toBe("dark");
    expect(run("rusak", true)).toBe("dark");
  });
});
