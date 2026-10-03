"use client";

import { Columns3, LoaderCircle, Square } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChainMultiSelect, type ChainOption } from "@/components/chain-multi-select";
import { getChain } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { serializeChainSelection, type MultichainViewMode } from "@/lib/multichain";
import type { ChainId } from "@/lib/types";

const MODES: Array<{ id: MultichainViewMode; label: string; icon: typeof Square }> = [
  { id: "compare", label: "Perbandingan", icon: Columns3 },
  { id: "single", label: "Satu chain", icon: Square },
];

interface MultichainViewControlsProps {
  options: ChainOption[];
  mode: MultichainViewMode;
  /** Pilihan mode perbandingan. */
  selected: ChainId[];
  /** Jaringan yang dipakai bila pindah ke (atau sedang di) tampilan satu chain. */
  singleChain: ChainId | null;
}

/**
 * Pindah antara tampilan perbandingan (banyak jaringan) dan satu chain.
 * Semua pilihan disimpan di URL: `?tampilan=satu&jaringan=base`.
 */
export function MultichainViewControls({ options, mode, selected, singleChain }: MultichainViewControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const available = options.map((option) => option.chain);

  function navigate(nextMode: MultichainViewMode, chains: ChainId[]) {
    const params = new URLSearchParams(window.location.search);
    if (nextMode === "single") params.set("tampilan", "satu");
    else params.delete("tampilan");
    const value = nextMode === "single" ? chains[0] : serializeChainSelection(chains, available);
    if (value) params.set("jaringan", value);
    else params.delete("jaringan");
    const query = params.toString();
    startTransition(() => router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Pilih tampilan" className="inline-flex rounded-lg border border-line bg-surface-raised p-0.5">
        {MODES.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={mode === item.id}
              onClick={() => {
                if (item.id === mode) return;
                navigate(item.id, item.id === "single" && singleChain ? [singleChain] : available);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                mode === item.id ? "bg-surface text-foreground shadow-sm ring-1 ring-line" : "text-muted hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </div>

      {mode === "compare" ? (
        <ChainMultiSelect options={options} selected={selected} onChange={(next) => navigate("compare", next)} />
      ) : (
        <div role="radiogroup" aria-label="Pilih satu jaringan" className="flex flex-wrap gap-1.5">
          {options.map((option) => {
            const checked = option.chain === singleChain;
            return (
              <button
                key={option.chain}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => !checked && navigate("single", [option.chain])}
                title={option.detail}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  checked ? "bg-surface text-foreground ring-foreground/50" : "bg-surface-raised text-foreground/80 ring-line hover:text-foreground",
                  option.muted && !checked && "opacity-60",
                )}
              >
                {getChain(option.chain).name}
                {option.detail ? <span className="text-[11px] font-normal text-muted">{option.detail}</span> : null}
              </button>
            );
          })}
        </div>
      )}

      {pending ? (
        <span role="status" className="inline-flex items-center gap-1 text-[11px] text-muted">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          Memuat…
        </span>
      ) : null}
    </div>
  );
}
