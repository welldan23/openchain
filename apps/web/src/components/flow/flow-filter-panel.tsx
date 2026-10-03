import { CalendarRange, Info, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Panel } from "@/components/ui/panel";
import { getChain } from "@/lib/chains";
import { cn } from "@/lib/cn";
import {
  describeRange,
  flowFilterHref,
  RANGE_PRESETS,
  wibDateValue,
  type FlowFilterParams,
  type FlowTimeFilter,
} from "@/lib/flow-filter";
import type { ChainId } from "@/lib/types";

const CHIP =
  "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const CHIP_ACTIVE = "bg-accent/15 text-accent ring-accent/40";
const CHIP_IDLE = "bg-surface-raised text-foreground/80 ring-line hover:text-foreground hover:ring-accent/40";

interface FlowFilterPanelProps {
  chain: ChainId;
  address: string;
  chains: Array<{ chain: ChainId; hasData: boolean }>;
  /** Periode seluruh data aliran dana. */
  window: { from: string; to: string };
  filter: FlowTimeFilter;
  shownCount: number;
  totalCount: number;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[6rem_1fr] sm:items-start">
      <p className="pt-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * Filter chain dan rentang waktu. Semua pilihan berupa tautan dan form GET,
 * jadi filter tersimpan di URL dan bisa dibagikan.
 */
export function FlowFilterPanel({ chain, address, chains, window, filter, shownCount, totalCount }: FlowFilterPanelProps) {
  // Filter waktu ikut terbawa saat pindah chain.
  const timeParams: FlowFilterParams =
    filter.preset === null
      ? { dari: filter.customFrom, sampai: filter.customTo }
      : { rentang: filter.preset === "semua" ? undefined : filter.preset };
  const minDate = wibDateValue(window.from);
  const maxDate = wibDateValue(window.to);

  return (
    <Panel
      id="filter"
      title="Filter"
      description={`Menampilkan ${shownCount} dari ${totalCount} transfer · ${describeRange(filter)}`}
      icon={SlidersHorizontal}
    >
      <div className="space-y-4">
        {filter.notice ? (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {filter.notice}
          </p>
        ) : null}

        <Row label="Chain">
          <nav aria-label="Pilih chain" className="contents">
            {chains.map((item) => {
              const name = getChain(item.chain).name;
              if (!item.hasData) {
                return (
                  <span
                    key={item.chain}
                    title="Belum ada data aliran dana address ini di chain tersebut"
                    className={cn(CHIP, "cursor-not-allowed bg-transparent text-muted/60 ring-line/60")}
                  >
                    {name}
                    <span className="sr-only"> (belum ada data)</span>
                  </span>
                );
              }
              const active = item.chain === chain;
              return (
                <Link
                  key={item.chain}
                  href={flowFilterHref(item.chain, address, timeParams)}
                  aria-current={active ? "page" : undefined}
                  className={cn(CHIP, active ? CHIP_ACTIVE : CHIP_IDLE)}
                >
                  {name}
                </Link>
              );
            })}
          </nav>
        </Row>

        <Row label="Rentang">
          <nav aria-label="Pilih rentang waktu" className="contents">
            {RANGE_PRESETS.map((preset) => {
              const active = filter.preset === preset.id;
              return (
                <Link
                  key={preset.id}
                  href={flowFilterHref(chain, address, { rentang: preset.id === "semua" ? undefined : preset.id })}
                  aria-current={active ? "true" : undefined}
                  className={cn(CHIP, active ? CHIP_ACTIVE : CHIP_IDLE)}
                >
                  {preset.label}
                </Link>
              );
            })}
          </nav>
        </Row>

        <Row label="Tanggal">
          <form
            action={`/flow/${chain}/${address}`}
            method="get"
            className="flex flex-wrap items-end gap-2"
            aria-label="Rentang tanggal pilihan sendiri"
          >
            <label className="grid gap-1 text-[11px] text-muted">
              Dari
              <input
                type="date"
                name="dari"
                min={minDate}
                max={maxDate}
                defaultValue={filter.customFrom}
                className="rounded-lg border border-line bg-surface-raised px-2.5 py-1.5 text-xs text-foreground [color-scheme:dark] focus-visible:outline-2 focus-visible:outline-accent"
              />
            </label>
            <label className="grid gap-1 text-[11px] text-muted">
              Sampai
              <input
                type="date"
                name="sampai"
                min={minDate}
                max={maxDate}
                defaultValue={filter.customTo}
                className="rounded-lg border border-line bg-surface-raised px-2.5 py-1.5 text-xs text-foreground [color-scheme:dark] focus-visible:outline-2 focus-visible:outline-accent"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-background transition hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <CalendarRange className="size-3.5" aria-hidden />
              Terapkan
            </button>
          </form>
        </Row>
      </div>
    </Panel>
  );
}
