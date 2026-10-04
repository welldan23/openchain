import { CircleAlert, CircleArrowDown, CircleHelp, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { RiskTone } from "@/lib/labels";
import type { RiskLevel, RiskSeverity } from "@/lib/types";

/**
 * Ikon nada risiko: bentuknya berbeda tiap tingkat (segi delapan, segitiga,
 * lingkaran, panah turun), jadi tingkat tetap terbaca tanpa warna.
 */
export const RISK_TONE_ICONS: Record<Exclude<RiskTone, "neutral">, LucideIcon> = {
  critical: OctagonAlert,
  high: TriangleAlert,
  medium: CircleAlert,
  low: CircleArrowDown,
};

export const RISK_LEVEL_ICONS: Record<RiskLevel, LucideIcon> = {
  ...RISK_TONE_ICONS,
  unknown: CircleHelp,
};

export const SEVERITY_ICONS: Record<RiskSeverity, LucideIcon> = {
  ...RISK_TONE_ICONS,
  info: Info,
};
