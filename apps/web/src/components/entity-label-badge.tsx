"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Bot,
  CircleHelp,
  Droplets,
  Fish,
  Flame,
  Hammer,
  Landmark,
  Route,
  Scale,
  Vault,
} from "lucide-react";
import { useId } from "react";
import { usePopover } from "@/components/ui/use-popover";
import { cn } from "@/lib/cn";
import { ENTITY_LABEL_META } from "@/lib/labels";
import type { EntityLabel, EntityLabelType } from "@/lib/types";

/** Ikon tiap jenis entitas, dipakai juga sebagai penanda di peta. */
export const ENTITY_ICONS: Record<EntityLabelType, LucideIcon> = {
  exchange: Landmark,
  router: Route,
  bridge: ArrowLeftRight,
  market_maker: Scale,
  treasury: Vault,
  bot: Bot,
  whale: Fish,
  deployer: Hammer,
  liquidity_pool: Droplets,
  burn: Flame,
  unknown: CircleHelp,
};

const SOURCE_META: Record<EntityLabel["source"], { short: string; title: string; description: string }> = {
  external: {
    short: "eksternal",
    title: "Label eksternal",
    description: "Berasal dari sumber pihak ketiga. Berguna sebagai petunjuk, tapi bukan bukti kepemilikan.",
  },
  heuristic: {
    short: "dugaan",
    title: "Dugaan OpenChain",
    description: "Disimpulkan dari pola transaksi oleh OpenChain. Selalu estimasi dan bisa keliru.",
  },
};

const POPOVER_WIDTH = 248;

/**
 * Label entitas beserta sumbernya. Garis tepi utuh untuk label eksternal dan
 * putus-putus untuk dugaan, jadi asal label terlihat tanpa membaca teks.
 * Tap, hover, atau fokus untuk melihat rincian sumbernya.
 */
export function EntityLabelBadge({
  label,
  interactive = true,
}: {
  label: EntityLabel;
  /** `false` di dalam tautan atau tombol lain, supaya tidak ada tombol bersarang. */
  interactive?: boolean;
}) {
  if (!interactive) return <StaticEntityLabelBadge label={label} />;
  return <InteractiveEntityLabelBadge label={label} />;
}

function badgeClass(label: EntityLabel) {
  return cn(
    "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-inset",
    ENTITY_LABEL_META[label.type].className,
    label.source === "external" ? "ring-1" : "ring-0 outline-1 -outline-offset-1 outline-dashed outline-current/40",
  );
}

function StaticEntityLabelBadge({ label }: { label: EntityLabel }) {
  const meta = ENTITY_LABEL_META[label.type];
  const source = SOURCE_META[label.source];
  const Icon = ENTITY_ICONS[label.type];
  return (
    <span className={badgeClass(label)} title={`${source.title} · sumber: ${label.sourceName}`}>
      <Icon className="size-3 shrink-0" aria-hidden />
      {label.name ?? meta.label}
      <span className="opacity-70">· {source.short}</span>
    </span>
  );
}

function InteractiveEntityLabelBadge({ label }: { label: EntityLabel }) {
  const meta = ENTITY_LABEL_META[label.type];
  const source = SOURCE_META[label.source];
  const Icon = ENTITY_ICONS[label.type];
  const popoverId = useId();
  const { rootRef, triggerRef, open, alignEnd, triggerProps } = usePopover<HTMLButtonElement>(POPOVER_WIDTH);

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={open ? popoverId : undefined}
        {...triggerProps}
        className={cn(
          badgeClass(label),
          "cursor-help transition hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-accent",
        )}
      >
        <Icon className="size-3 shrink-0" aria-hidden />
        {label.name ?? meta.label}
        <span className="opacity-70">· {source.short}</span>
      </button>
      {open ? (
        <span
          id={popoverId}
          role="tooltip"
          style={{ width: POPOVER_WIDTH }}
          className={cn(
            "absolute top-full z-30 mt-1.5 rounded-lg border border-line bg-surface-raised p-2.5 text-left text-[11px] leading-relaxed font-normal whitespace-normal text-foreground/90 shadow-xl shadow-black/40",
            alignEnd ? "right-0" : "left-0",
          )}
        >
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            <Icon className="size-3.5" aria-hidden />
            {label.name ?? meta.label}
          </span>
          <span className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            <span className="text-muted">Jenis</span>
            <span>{meta.label}</span>
            <span className="text-muted">Asal</span>
            <span>{source.title}</span>
            <span className="text-muted">Sumber</span>
            <span>{label.sourceName}</span>
          </span>
          <span className="mt-1.5 block text-muted">{source.description}</span>
        </span>
      ) : null}
    </span>
  );
}
