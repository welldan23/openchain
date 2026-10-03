/**
 * Logika seksi Sebaran Pemegang: membagi supply per peringkat holder dan
 * mengelompokkan holder teratas menurut label entitas.
 */
import { ENTITY_LABEL_META } from "./labels";
import type { EntityLabel, EntityLabelType, HolderConcentration, TokenHolder } from "./types";

export type SupplyTierId = "top1" | "top2-10" | "top11-50" | "rest";

export interface SupplyTier {
  id: SupplyTierId;
  label: string;
  /** Persen dari total supply. */
  pct: number;
  /** Nama entitas holder #1 bila berlabel. */
  holderName?: string;
}

/** Bulatkan ke 2 desimal dan buang nilai negatif akibat data yang tidak konsisten. */
function clampPct(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100);
}

/**
 * Supply dibagi per peringkat holder: #1, #2–10, #11–50, dan sisanya.
 * Dihitung dari saldo holder teratas dan angka konsentrasi pada snapshot.
 */
export function buildSupplyTiers(
  holders: TokenHolder[],
  concentration: HolderConcentration,
): SupplyTier[] {
  if (holders.length === 0) return [];
  const top1 = holders[0].sharePct;
  const top1Label = holders[0].label;
  return [
    {
      id: "top1",
      label: "Holder #1",
      pct: clampPct(top1),
      holderName: top1Label ? (top1Label.name ?? ENTITY_LABEL_META[top1Label.type].label) : undefined,
    },
    { id: "top2-10", label: "Holder #2–10", pct: clampPct(concentration.top10Pct - top1) },
    {
      id: "top11-50",
      label: "Holder #11–50",
      pct: clampPct(concentration.top50Pct - concentration.top10Pct),
    },
    { id: "rest", label: "Holder lainnya", pct: clampPct(100 - concentration.top50Pct) },
  ];
}

export interface LabelGroup {
  type: EntityLabelType;
  label: string;
  /** Persen dari total supply yang dipegang kelompok ini. */
  pct: number;
  count: number;
  /** Asal label di kelompok ini; kosong untuk holder tanpa label. */
  sources: Array<EntityLabel["source"]>;
}

/** Holder teratas dikelompokkan menurut jenis label, urut dari porsi terbesar. */
export function groupHoldersByLabel(holders: TokenHolder[]): LabelGroup[] {
  const groups = new Map<EntityLabelType, LabelGroup>();
  for (const holder of holders) {
    const type = holder.label?.type ?? "unknown";
    const group = groups.get(type) ?? {
      type,
      label: ENTITY_LABEL_META[type].label,
      pct: 0,
      count: 0,
      sources: [],
    };
    group.pct = clampPct(group.pct + holder.sharePct);
    group.count += 1;
    if (holder.label && !group.sources.includes(holder.label.source)) {
      group.sources.push(holder.label.source);
    }
    groups.set(type, group);
  }
  return [...groups.values()].sort((a, b) => b.pct - a.pct || b.count - a.count);
}

/** "label eksternal", "heuristic", "eksternal & heuristic", atau "tanpa label". */
export function describeLabelSources(sources: LabelGroup["sources"]): string {
  if (sources.length === 0) return "tanpa label";
  if (sources.length > 1) return "eksternal & heuristic";
  return sources[0] === "external" ? "label eksternal" : "heuristic";
}
