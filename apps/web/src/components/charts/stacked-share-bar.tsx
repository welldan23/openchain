"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { ChartTooltip } from "./chart-tooltip";
import { useMarkTooltip } from "./use-mark-tooltip";

export interface ShareSegment {
  id: string;
  label: string;
  /** Porsi segmen dalam persen dari total (0–100), untuk lebar. */
  share: number;
  /** Nilai yang ditampilkan, mis. "18,4%". */
  valueText: string;
  detailText?: string;
  color: string;
}

const TOOLTIP_WIDTH = 216;

/**
 * Batang bertumpuk horizontal untuk komposisi (part-to-whole), dengan celah
 * 2px antarsegmen, ujung data membulat 4px, legenda bernilai, dan tooltip
 * per segmen. Legenda memuat semua nilai, jadi tooltip hanya pelengkap.
 */
export function StackedShareBar({ segments, label }: { segments: ShareSegment[]; label: string }) {
  const tooltipId = useId();
  const { containerRef, active, markProps } = useMarkTooltip<HTMLDivElement>(TOOLTIP_WIDTH);
  const visible = segments.filter((segment) => segment.share > 0);
  const activeSegment = visible.find((segment) => segment.id === active?.id);

  return (
    <figure>
      <div ref={containerRef} className="relative">
        <div role="group" aria-label={label} className="flex h-3.5 gap-[2px]">
          {visible.map((segment, index) => (
            <div
              key={segment.id}
              role="img"
              tabIndex={0}
              aria-label={`${segment.label}: ${segment.valueText}${segment.detailText ? `, ${segment.detailText}` : ""}`}
              aria-describedby={active?.id === segment.id ? tooltipId : undefined}
              {...markProps(segment.id)}
              style={{ flexGrow: segment.share, flexBasis: 0, backgroundColor: segment.color }}
              className={cn(
                "h-full min-w-[3px] cursor-pointer transition-opacity outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                index === visible.length - 1 && "rounded-r-[4px]",
                active && active.id !== segment.id && "opacity-50",
              )}
            />
          ))}
        </div>
        {active && activeSegment ? (
          <ChartTooltip
            id={tooltipId}
            x={active.x}
            y={active.y}
            width={TOOLTIP_WIDTH}
            value={activeSegment.valueText}
            label={activeSegment.label}
            detail={activeSegment.detailText}
            color={activeSegment.color}
          />
        ) : null}
      </div>
      <figcaption className="sr-only">{label}</figcaption>
      <ul className="mt-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        {segments.map((segment) => (
          <li key={segment.id} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: segment.color }}
            />
            <span className="min-w-0 truncate text-foreground/80">{segment.label}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">{segment.valueText}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
