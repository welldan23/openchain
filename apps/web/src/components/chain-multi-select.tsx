"use client";

import { Check, ChevronDown, Layers } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ChainBadge } from "@/components/badges";
import { getChain } from "@/lib/chains";
import { cn } from "@/lib/cn";
import type { ChainId } from "@/lib/types";

export interface ChainOption {
  chain: ChainId;
  /** Keterangan kecil di samping nama chain, mis. "142 transaksi". */
  detail?: string;
  /** Opsi redup, mis. chain tanpa aktivitas; tetap bisa dipilih. */
  muted?: boolean;
}

interface ChainMultiSelectProps {
  options: ChainOption[];
  selected: ChainId[];
  onChange: (next: ChainId[]) => void;
  label?: string;
  /** Tampilkan tanda sedang memuat setelah pilihan berubah. */
  busy?: boolean;
}

/**
 * Pemilih beberapa jaringan sekaligus. Daftar centang terbuka di bawah
 * tombol; minimal satu jaringan harus tetap terpilih. Tutup dengan Escape
 * atau klik di luar.
 */
export function ChainMultiSelect({ options, selected, onChange, label = "Jaringan", busy = false }: ChainMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const selectedSet = new Set(selected);
  const all = options.length > 0 && options.every((option) => selectedSet.has(option.chain));

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle(chain: ChainId) {
    const next = selectedSet.has(chain) ? selected.filter((item) => item !== chain) : [...selected, chain];
    if (next.length === 0) return;
    // Urutan mengikuti daftar opsi supaya URL dan tampilan konsisten.
    onChange(options.map((option) => option.chain).filter((item) => next.includes(item)));
  }

  const summary = all
    ? `Semua ${options.length} jaringan`
    : selected.length === 1
      ? getChain(selected[0]).name
      : `${selected.length} dari ${options.length} jaringan`;

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-busy={busy}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Layers className="size-3.5 text-muted" aria-hidden />
        <span className="text-muted">{label}:</span>
        {summary}
        <ChevronDown className={cn("size-3.5 text-muted transition", open && "rotate-180")} aria-hidden />
      </button>
      {busy ? (
        <span role="status" className="ml-2 text-[11px] text-muted">
          Memuat…
        </span>
      ) : null}

      {open ? (
        <div
          id={panelId}
          className="absolute left-0 z-30 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface-raised p-2 shadow-xl shadow-black/40"
        >
          <fieldset>
            <legend className="px-2 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Pilih {label.toLowerCase()}
            </legend>
            <ul className="space-y-0.5">
              {options.map((option) => {
                const checked = selectedSet.has(option.chain);
                const lastChecked = checked && selected.length === 1;
                return (
                  <li key={option.chain}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition hover:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
                        lastChecked && "cursor-not-allowed",
                      )}
                      title={lastChecked ? "Minimal satu jaringan harus dipilih" : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={lastChecked}
                        onChange={() => toggle(option.chain)}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded border",
                          checked ? "border-accent bg-accent text-background" : "border-line bg-surface",
                        )}
                      >
                        {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                      <span className={cn("flex min-w-0 flex-1 items-center justify-between gap-2", option.muted && "opacity-60")}>
                        <ChainBadge chain={option.chain} />
                        {option.detail ? <span className="truncate text-[11px] text-muted">{option.detail}</span> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          <div className="mt-2 flex items-center justify-between border-t border-line px-2 pt-2">
            <button
              type="button"
              disabled={all}
              onClick={() => onChange(options.map((option) => option.chain))}
              className="text-[11px] font-medium text-foreground/90 transition hover:text-accent disabled:cursor-default disabled:text-muted"
            >
              Pilih semua
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-muted transition hover:text-foreground"
            >
              Selesai
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
