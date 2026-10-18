/**
 * Pemetaan bersama dari bentuk respons backend ke tipe frontend. Nilai yang
 * tidak dikenal tidak dipaksa jadi nilai lain: chain di luar daftar frontend
 * dilewati, dan jumlah yang tidak bisa dibaca menjadi `null`.
 */
import { CHAINS } from "../../chains";
import type { ChainId, EntityLabel, EntityLabelType, FindingClassification, InfoClassification } from "../../types";

/** Klasifikasi backend → istilah frontend. */
const CLASSIFICATION: Record<string, InfoClassification> = {
  verified_fact: "fact",
  derived_metric: "calculation",
  external_label: "external_label",
  heuristic: "heuristic",
  assumption: "assumption",
  unavailable: "unavailable",
};

export function toInfoClassification(value: string | null | undefined): InfoClassification {
  return (value && CLASSIFICATION[value]) || "unavailable";
}

/** Klasifikasi temuan; `unavailable` bukan temuan, jadi dipetakan ke asumsi (bukti paling lemah). */
export function toFindingClassification(value: string | null | undefined): FindingClassification {
  const mapped = toInfoClassification(value);
  return mapped === "unavailable" ? "assumption" : mapped;
}

/** Klasifikasi frontend → istilah backend, untuk dikirim balik. */
export function fromFindingClassification(value: FindingClassification): string {
  return { fact: "verified_fact", calculation: "derived_metric", external_label: "external_label", heuristic: "heuristic", assumption: "assumption" }[value];
}

export function toChainId(value: string | null | undefined): ChainId | null {
  return value && Object.hasOwn(CHAINS, value) ? (value as ChainId) : null;
}

/** Angka dari string desimal backend; `null` bila kosong atau tidak bisa dibaca. */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const LABEL_TYPES: readonly EntityLabelType[] = ["exchange", "router", "bridge", "market_maker", "treasury", "bot", "whale", "deployer", "liquidity_pool", "burn", "unknown"];

/** Bentuk label dari backend (`/tokens`, `/flows`, `/maps`, …). */
export interface ApiLabel {
  type: string;
  name?: string | null;
  source: string;
  sourceName?: string | null;
  confidence?: number | null;
}

/** Label backend → label frontend; label dari pengguna tidak dipakai sebagai label entitas. */
export function toEntityLabel(label: ApiLabel | null | undefined): EntityLabel | undefined {
  if (!label) return undefined;
  const type = (LABEL_TYPES as readonly string[]).includes(label.type) ? (label.type as EntityLabelType) : "unknown";
  const source = label.source === "external" ? "external" : label.source === "heuristic" ? "heuristic" : null;
  if (!source) return undefined;
  return {
    type,
    ...(label.name ? { name: label.name } : {}),
    source,
    sourceName: label.sourceName ?? (source === "external" ? "Sumber eksternal" : "OpenChain heuristic"),
  };
}
