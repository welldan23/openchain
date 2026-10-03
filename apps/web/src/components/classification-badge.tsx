"use client";

import type { LucideIcon } from "lucide-react";
import { BadgeCheck, Calculator, CircleHelp, Lightbulb, Tag } from "lucide-react";
import { useId } from "react";
import { usePopover } from "@/components/ui/use-popover";
import { cn } from "@/lib/cn";
import { CLASSIFICATION_META } from "@/lib/labels";
import type { FindingClassification } from "@/lib/types";

const ICONS: Record<FindingClassification, LucideIcon> = {
  fact: BadgeCheck,
  calculation: Calculator,
  heuristic: Lightbulb,
  external_label: Tag,
  assumption: CircleHelp,
};

/** Lebar popover penjelasan (px), dipakai juga untuk cek ruang di layar. */
const TOOLTIP_WIDTH = 240;

const BADGE_BASE =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset";

interface ClassificationBadgeProps {
  classification: FindingClassification;
  /**
   * `true` (default): badge bisa di-tap/hover/fokus untuk menampilkan arti tag.
   * `false`: badge statis, mis. di legenda yang sudah menulis penjelasannya.
   */
  interactive?: boolean;
}

/**
 * Tag transparansi temuan: fakta on-chain, kalkulasi, heuristic, label
 * eksternal, atau asumsi. Penjelasannya muncul saat badge di-tap di HP,
 * di-hover di desktop, atau difokus lewat keyboard.
 */
export function ClassificationBadge({ classification, interactive = true }: ClassificationBadgeProps) {
  const meta = CLASSIFICATION_META[classification];
  const Icon = ICONS[classification];

  if (!interactive) {
    return (
      <span className={cn(BADGE_BASE, meta.className)}>
        <Icon className="size-3" aria-hidden />
        {meta.label}
      </span>
    );
  }

  return <InteractiveBadge classification={classification} />;
}

function InteractiveBadge({ classification }: { classification: FindingClassification }) {
  const meta = CLASSIFICATION_META[classification];
  const Icon = ICONS[classification];
  const tooltipId = useId();
  const { rootRef, triggerRef, open, alignEnd, triggerProps } = usePopover<HTMLButtonElement>(TOOLTIP_WIDTH);

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={open ? tooltipId : undefined}
        {...triggerProps}
        className={cn(
          BADGE_BASE,
          meta.className,
          "cursor-help transition hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        )}
      >
        <Icon className="size-3" aria-hidden />
        {meta.label}
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          style={{ width: TOOLTIP_WIDTH }}
          className={cn(
            "absolute top-full z-30 mt-1.5 rounded-lg border border-line bg-surface-raised p-2.5 text-left text-[11px] leading-relaxed font-normal whitespace-normal text-foreground/90 shadow-xl shadow-black/40",
            alignEnd ? "right-0" : "left-0",
          )}
        >
          <span className="block font-semibold text-foreground">{meta.label}</span>
          <span className="mt-0.5 block text-muted">{meta.description}</span>
        </span>
      ) : null}
    </span>
  );
}
