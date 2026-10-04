"use client";

import type { LucideIcon } from "lucide-react";
import { BadgeCheck, Calculator, CircleHelp, CircleSlash, Lightbulb, Tag } from "lucide-react";
import { useId } from "react";
import { usePopover } from "@/components/ui/use-popover";
import { cn } from "@/lib/cn";
import { CLASSIFICATION_META } from "@/lib/labels";
import type { InfoClassification } from "@/lib/types";

const ICONS: Record<InfoClassification, LucideIcon> = {
  fact: BadgeCheck,
  calculation: Calculator,
  heuristic: Lightbulb,
  external_label: Tag,
  assumption: CircleHelp,
  unavailable: CircleSlash,
};

/** Lebar popover penjelasan (px), dipakai juga untuk cek ruang di layar. */
const TOOLTIP_WIDTH = 256;
/** Perkiraan tinggi popover untuk memutuskan buka ke atas atau ke bawah. */
const TOOLTIP_HEIGHT = 150;

const BADGE_BASE =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset";

interface ClassificationBadgeProps {
  classification: InfoClassification;
  /**
   * `true` (default): badge bisa di-tap/hover/fokus untuk menampilkan arti tag.
   * `false`: badge statis, mis. di legenda yang sudah menulis penjelasannya.
   */
  interactive?: boolean;
  /** Konteks tambahan di tooltip, mis. "Sumber: DEX indexer · keyakinan 72%". */
  detail?: string;
}

/**
 * Tag jenis informasi: fakta on-chain, kalkulasi, heuristic, label eksternal,
 * asumsi, atau data tidak tersedia. Penjelasan, cara mengecek, dan konteksnya
 * muncul saat badge di-tap di HP, di-hover di desktop, atau difokus lewat
 * keyboard; pembaca layar selalu mendapat penjelasannya.
 */
export function ClassificationBadge({ classification, interactive = true, detail }: ClassificationBadgeProps) {
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

  return <InteractiveBadge classification={classification} detail={detail} />;
}

function InteractiveBadge({ classification, detail }: { classification: InfoClassification; detail?: string }) {
  const meta = CLASSIFICATION_META[classification];
  const Icon = ICONS[classification];
  const tooltipId = useId();
  const { rootRef, triggerRef, open, alignEnd, placeAbove, triggerProps } = usePopover<HTMLButtonElement>(
    TOOLTIP_WIDTH,
    TOOLTIP_HEIGHT,
  );

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        // Tooltip tersembunyi tetap dipakai sebagai deskripsi oleh pembaca layar.
        aria-describedby={tooltipId}
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
      <span
        id={tooltipId}
        role="tooltip"
        hidden={!open}
        style={{ width: TOOLTIP_WIDTH }}
        className={cn(
          "absolute z-30 rounded-lg border border-line bg-surface-raised p-2.5 text-left text-[11px] leading-relaxed font-normal whitespace-normal text-foreground/90 shadow-xl shadow-black/40",
          placeAbove ? "bottom-full mb-1.5" : "top-full mt-1.5",
          alignEnd ? "right-0" : "left-0",
        )}
      >
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <Icon className="size-3.5" aria-hidden />
          {meta.label}
          <span className="sr-only">.</span>
        </span>{" "}
        <span className="mt-0.5 block text-muted">{meta.description}</span>{" "}
        {detail ? <span className="mt-1.5 block text-foreground/90">{detail}</span> : null}{" "}
        <span className="mt-1.5 block border-t border-line pt-1.5 text-muted">
          <span className="font-medium text-foreground/80">Cara cek: </span>
          {meta.howToCheck}
        </span>
      </span>
    </span>
  );
}
