"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { ChartTooltip } from "./chart-tooltip";
import { useMarkTooltip } from "./use-mark-tooltip";

export interface BarListItem {
  id: string;
  label: string;
  /** Nilai mentah untuk panjang batang (diskalakan ke item terbesar). */
  value: number;
  valueText: string;
  detailText?: string;
}

const TOOLTIP_WIDTH = 216;

/**
 * Daftar batang horizontal satu seri (satu warna) untuk membandingkan besaran
 * antarkategori nominal. Nilai dan detail tertulis di tiap baris, jadi tooltip
 * hanya pelengkap. Seluruh baris menjadi area hover/tap.
 */
export function BarList({ items, color, label }: { items: BarListItem[]; color: string; label: string }) {
  const tooltipId = useId();
  const { containerRef, active, markProps } = useMarkTooltip<HTMLDivElement>(TOOLTIP_WIDTH);
  const max = Math.max(...items.map((item) => item.value), 0);
  const activeItem = items.find((item) => item.id === active?.id);

  return (
    <div ref={containerRef} className="relative">
      <ul aria-label={label} className="space-y-1">
        {items.map((item) => (
          <li
            key={item.id}
            tabIndex={0}
            aria-describedby={active?.id === item.id ? tooltipId : undefined}
            {...markProps(item.id)}
            className={cn(
              "grid cursor-pointer grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 transition outline-none focus-visible:outline-2 focus-visible:outline-accent sm:grid-cols-[minmax(0,11rem)_1fr_auto]",
              active?.id === item.id && "bg-surface-raised",
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-xs text-foreground/90">{item.label}</span>
              {item.detailText ? (
                <span className="block truncate text-[11px] text-muted">{item.detailText}</span>
              ) : null}
            </span>
            <span aria-hidden className="h-2 min-w-0">
              <span
                className="block h-full rounded-r-[4px]"
                style={{ width: `${max > 0 ? (item.value / max) * 100 : 0}%`, backgroundColor: color }}
              />
            </span>
            <span className="text-xs font-medium tabular-nums text-foreground">{item.valueText}</span>
          </li>
        ))}
      </ul>
      {active && activeItem ? (
        <ChartTooltip
          id={tooltipId}
          x={active.x}
          y={active.y}
          width={TOOLTIP_WIDTH}
          value={activeItem.valueText}
          label={activeItem.label}
          detail={activeItem.detailText}
          color={color}
        />
      ) : null}
    </div>
  );
}
