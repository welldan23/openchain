"use client";

import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { useState } from "react";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { THEME_META } from "@/lib/labels";
import { resolveTheme, THEME_PREFERENCES } from "@/lib/theme";
import { setThemePreference, useThemePreference } from "@/lib/theme-store";
import type { ThemePreference } from "@/lib/types";

const ICONS = { system: Monitor, dark: Moon, light: Sun } as const;
const SWATCH: Record<"dark" | "light", { bg: string; surface: string; line: string }> = {
  dark: { bg: "#070b12", surface: "#131c2b", line: "#2dd4bf" },
  light: { bg: "#f5f7fa", surface: "#ffffff", line: "#0f766e" },
};

function Swatch({ theme }: { theme: "dark" | "light" }) {
  const colors = SWATCH[theme];
  return (
    <span aria-hidden className="block h-10 w-full overflow-hidden rounded-md ring-1 ring-line" style={{ backgroundColor: colors.bg }}>
      <span className="mx-2 mt-2 block h-2 w-1/2 rounded-sm" style={{ backgroundColor: colors.line }} />
      <span className="mx-2 mt-1.5 block h-3 rounded-sm" style={{ backgroundColor: colors.surface }} />
    </span>
  );
}

/** Pilihan tema; berlaku langsung dan disimpan di browser ini. */
export function ThemeSettings() {
  const preference = useThemePreference();
  const [status, setStatus] = useState("");

  function choose(value: ThemePreference) {
    setThemePreference(value);
    const resolved = resolveTheme(value, window.matchMedia("(prefers-color-scheme: light)").matches);
    setStatus(value === "system" ? `Tema mengikuti perangkat (saat ini ${resolved === "light" ? "terang" : "gelap"}).` : `Tema ${THEME_META[value].toLowerCase()} dipakai.`);
  }

  return (
    <Panel id="tema" title="Tema" description="Berlaku langsung dan disimpan di browser ini." icon={Palette}>
      <fieldset>
        <legend className="sr-only">Pilih tema tampilan</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEME_PREFERENCES.map((value) => {
            const Icon = ICONS[value];
            const checked = preference === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                  checked ? "border-accent bg-accent/10" : "border-line hover:border-accent/50",
                )}
              >
                <input type="radio" name="tema" value={value} checked={checked} disabled={preference === undefined} onChange={() => choose(value)} className="sr-only" />
                {value === "system" ? (
                  <span className="grid grid-cols-2 gap-1">
                    <Swatch theme="dark" />
                    <Swatch theme="light" />
                  </span>
                ) : (
                  <Swatch theme={value} />
                )}
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Icon className="size-4 text-accent" aria-hidden />
                  {THEME_META[value]}
                  {checked ? <span className="ml-auto text-[11px] font-normal text-accent">Dipakai</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <p role="status" aria-live="polite" className={status ? "mt-3 text-xs text-emerald-300" : "sr-only"}>
        {status}
      </p>
    </Panel>
  );
}
