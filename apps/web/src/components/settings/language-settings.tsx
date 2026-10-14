import { Languages } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { LANGUAGE_META } from "@/lib/labels";
import type { LanguagePreference } from "@/lib/types";

const LANGUAGES: LanguagePreference[] = ["id", "en"];

/** Bahasa antarmuka. Bahasa yang belum diterjemahkan ditampilkan tapi tidak bisa dipilih. */
export function LanguageSettings({ current }: { current: LanguagePreference }) {
  return (
    <Panel id="bahasa" title="Bahasa" description="Bahasa untuk halaman, label, dan ekspor laporan." icon={Languages}>
      <fieldset>
        <legend className="sr-only">Pilih bahasa antarmuka</legend>
        <ul className="space-y-2">
          {LANGUAGES.map((value) => {
            const meta = LANGUAGE_META[value];
            const checked = value === current;
            return (
              <li key={value}>
                <label
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3",
                    checked ? "border-accent bg-accent/10" : "border-line",
                    meta.available ? "cursor-pointer" : "cursor-not-allowed opacity-70",
                  )}
                >
                  <input
                    type="radio"
                    name="bahasa"
                    value={value}
                    defaultChecked={checked}
                    disabled={!meta.available}
                    aria-describedby={`bahasa-${value}-catatan`}
                    className="mt-1 size-3.5 accent-[var(--color-accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground" lang={value}>
                      {meta.nativeLabel}
                    </span>
                    <span id={`bahasa-${value}-catatan`} className="block text-xs text-muted">
                      {meta.note}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
    </Panel>
  );
}
