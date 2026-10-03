"use client";

import { CircleOff, Tags } from "lucide-react";
import { ENTITY_ICONS } from "@/components/entity-label-badge";
import { cn } from "@/lib/cn";
import { ENTITY_LABEL_META } from "@/lib/labels";
import type { MapNode } from "@/lib/types";
import {
  EMPTY_LABEL_FILTER,
  isLabelFilterActive,
  labelTypeCounts,
  type LabelFilter,
  type LabelFilterKey,
  type LabelSourceFilter,
} from "@/lib/wallet-map";

const SOURCE_OPTIONS: Array<{ id: LabelSourceFilter; label: string }> = [
  { id: "all", label: "Semua" },
  { id: "external", label: "Eksternal" },
  { id: "heuristic", label: "Dugaan" },
];

function keyLabel(key: LabelFilterKey): string {
  return key === "none" ? "Tanpa label" : ENTITY_LABEL_META[key].label;
}

/**
 * Filter label entitas di peta: chip per jenis label (klik untuk
 * menyembunyikan/menampilkan) dan pilihan sumber label.
 */
export function LabelFilterBar({
  nodes,
  filter,
  onChange,
}: {
  nodes: MapNode[];
  filter: LabelFilter;
  onChange: (next: LabelFilter) => void;
}) {
  const counts = labelTypeCounts(nodes);

  function toggle(key: LabelFilterKey) {
    const hiddenTypes = new Set(filter.hiddenTypes);
    if (hiddenTypes.has(key)) hiddenTypes.delete(key);
    else hiddenTypes.add(key);
    onChange({ ...filter, hiddenTypes });
  }

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tampilkan jenis label">
        <span className="inline-flex items-center gap-1 text-[11px] text-muted">
          <Tags className="size-3.5" aria-hidden />
          Label:
        </span>
        {counts.map(({ key, count }) => {
          const shown = !filter.hiddenTypes.has(key);
          const Icon = key === "none" ? CircleOff : ENTITY_ICONS[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={shown}
              title={shown ? `Sembunyikan ${keyLabel(key).toLowerCase()}` : `Tampilkan ${keyLabel(key).toLowerCase()}`}
              onClick={() => toggle(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                shown
                  ? "bg-surface-raised text-foreground/90 ring-line hover:text-foreground"
                  : "bg-transparent text-muted line-through decoration-muted/60 ring-line/60 hover:text-foreground/80",
              )}
            >
              <Icon className="size-3" aria-hidden />
              {keyLabel(key)}
              <span className="tabular-nums text-muted no-underline">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-muted" id="sumber-label-peta">
          Sumber label:
        </span>
        <div role="group" aria-labelledby="sumber-label-peta" className="inline-flex rounded-lg border border-line bg-surface-raised p-0.5">
          {SOURCE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={filter.source === option.id}
              onClick={() => onChange({ ...filter, source: option.id })}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                filter.source === option.id ? "bg-surface text-foreground shadow-sm ring-1 ring-line" : "text-muted hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {isLabelFilterActive(filter) ? (
          <button
            type="button"
            onClick={() => onChange(EMPTY_LABEL_FILTER)}
            className="text-[11px] text-muted underline-offset-2 transition hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Reset filter label
          </button>
        ) : null}
      </div>
    </div>
  );
}
