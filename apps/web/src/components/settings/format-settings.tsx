"use client";

import { Calculator, Info, LoaderCircle } from "lucide-react";
import { useState, useSyncExternalStore, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-parts";
import { Panel } from "@/components/ui/panel";
import { updateDisplayPreferences } from "@/lib/api/settings";
import { cn } from "@/lib/cn";
import { formatAmount, formatDateTimeIn, formatValue, PREVIEW_SAMPLE, timeZoneLabel, type FormatPreferences } from "@/lib/display-format";
import { NUMBER_LOCALE_META, TIME_DISPLAY_META, VALUE_UNIT_META } from "@/lib/labels";
import type { DisplayPreferences, NumberLocale, TimeDisplay, ValueUnit } from "@/lib/types";

interface Option<T extends string> {
  value: T;
  label: string;
  hint: string;
}

function OptionGroup<T extends string>({ name, legend, options, value, disabled, onChange }: { name: string; legend: string; options: Option<T>[]; value: T; disabled: boolean; onChange: (value: T) => void }) {
  return (
    <fieldset>
      <legend className="text-xs font-medium text-foreground">{legend}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
                checked ? "border-accent bg-accent/10" : "border-line hover:border-accent/50",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input type="radio" name={name} value={option.value} checked={checked} disabled={disabled} onChange={() => onChange(option.value)} className="mt-0.5 size-3.5 accent-[var(--color-accent)]" />
              <span className="min-w-0">
                <span className="block text-sm text-foreground">{option.label}</span>
                <span className="block text-xs text-muted">{option.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const noop = () => () => {};

/**
 * Format angka, waktu, dan satuan nilai, dengan pratinjau langsung dari
 * contoh tetap. Teks hasil Intl baru dirender di browser: data locale Node
 * dan browser bisa berbeda (mis. jenis spasi), dan perbedaan itu merusak
 * hidrasi.
 */
export function FormatSettings({ initial, timeZone }: { initial: DisplayPreferences; timeZone: string }) {
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  const shown = (text: string) => (inBrowser ? text : "…");
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<FormatPreferences>(initial);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const changed = (Object.keys(draft) as Array<keyof FormatPreferences>).some((key) => draft[key] !== saved[key]);
  const set = <K extends keyof FormatPreferences>(key: K, value: FormatPreferences[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus("");
  };

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        const next = await updateDisplayPreferences(saved, draft);
        setSaved(next);
        setStatus("Format tampilan disimpan.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Format tampilan gagal disimpan.");
      }
    });
  }

  const numberOptions: Option<NumberLocale>[] = (["id", "en"] as const).map((value) => ({ value, label: NUMBER_LOCALE_META[value].label, hint: `Contoh: ${NUMBER_LOCALE_META[value].example}` }));
  const timeOptions: Option<TimeDisplay>[] = [
    { value: "local", label: TIME_DISPLAY_META.local, hint: `${timeZone} (${shown(timeZoneLabel(timeZone))})` },
    { value: "utc", label: TIME_DISPLAY_META.utc, hint: "Sama untuk semua pembaca laporan di zona mana pun." },
  ];
  const compactOptions: Option<"ringkas" | "penuh">[] = [
    { value: "ringkas", label: "Ringkas", hint: `Contoh: ${shown(formatAmount(PREVIEW_SAMPLE.holders, { numberLocale: draft.numberLocale, compactNumbers: true }))}` },
    { value: "penuh", label: "Penuh", hint: `Contoh: ${shown(formatAmount(PREVIEW_SAMPLE.holders, { numberLocale: draft.numberLocale, compactNumbers: false }))}` },
  ];
  const unitOptions: Option<ValueUnit>[] = (["usd", "native"] as const).map((value) => ({ value, label: VALUE_UNIT_META[value].label, hint: VALUE_UNIT_META[value].description }));
  const preview = [
    { label: "Jumlah holder", value: formatAmount(PREVIEW_SAMPLE.holders, draft) },
    { label: "Likuiditas", value: formatValue({ usd: PREVIEW_SAMPLE.liquidityUsd, native: null }, { ...draft, valueUnit: "usd" }) },
    { label: "Transfer ETH", value: formatValue(PREVIEW_SAMPLE.transfer, draft) },
    { label: "Transfer token", value: formatValue(PREVIEW_SAMPLE.tokenTransfer, draft) },
    { label: "Waktu transaksi", value: formatDateTimeIn(PREVIEW_SAMPLE.at, draft, timeZone) },
  ];

  return (
    <Panel id="format-angka" title="Format angka, waktu, dan satuan nilai" description="Cara angka, jam, dan nilai transfer ditulis." icon={Calculator}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="space-y-5"
      >
        {error ? <FormAlert>{error}</FormAlert> : null}
        <OptionGroup name="format-angka" legend="Pemisah angka" options={numberOptions} value={draft.numberLocale} disabled={saving} onChange={(value) => set("numberLocale", value)} />
        <OptionGroup
          name="angka-ringkas"
          legend="Angka besar"
          options={compactOptions}
          value={draft.compactNumbers ? "ringkas" : "penuh"}
          disabled={saving}
          onChange={(value) => set("compactNumbers", value === "ringkas")}
        />
        <OptionGroup name="zona-waktu" legend="Waktu ditampilkan dalam" options={timeOptions} value={draft.timeDisplay} disabled={saving} onChange={(value) => set("timeDisplay", value)} />
        <OptionGroup name="satuan-nilai" legend="Satuan nilai transfer" options={unitOptions} value={draft.valueUnit} disabled={saving} onChange={(value) => set("valueUnit", value)} />

        <section aria-labelledby="pratinjau-format" className="rounded-lg border border-line bg-surface-raised p-3 sm:p-4">
          <h3 id="pratinjau-format" className="text-xs font-semibold text-foreground">
            Pratinjau
          </h3>
          <dl className="mt-2 divide-y divide-line" aria-live="polite">
            {preview.map((row) => (
              <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5">
                <dt className="text-xs text-muted">{row.label}</dt>
                <dd className="text-sm tabular-nums text-foreground">{shown(row.value)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted">
            <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span>Halaman lain masih memakai format bawaan (Indonesia, WIB, USD) sampai preferensi tersimpan di akun. Nilai di atas contoh tetap.</span>
          </p>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <p role="status" aria-live="polite" className={status ? "mr-auto text-xs text-emerald-300" : "sr-only"}>
            {status}
          </p>
          <button
            type="button"
            disabled={!changed || saving}
            onClick={() => setDraft(saved)}
            className="rounded-lg px-3 py-1.5 text-xs text-muted transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          >
            Batalkan perubahan
          </button>
          <button
            type="submit"
            disabled={!changed || saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-background transition hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
          >
            {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
            {saving ? "Menyimpan…" : "Simpan format"}
          </button>
        </div>
      </form>
    </Panel>
  );
}
