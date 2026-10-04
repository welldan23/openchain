import { getChain } from "@/lib/chains";
import { RISK_LEVEL_META, SEVERITY_META } from "@/lib/labels";
import type { ChainId, RiskLevel, RiskSeverity } from "@/lib/types";
import { RISK_LEVEL_ICONS, SEVERITY_ICONS } from "./risk/risk-icons";
import { Badge } from "./ui/badge";

export function ChainBadge({ chain }: { chain: ChainId }) {
  const info = getChain(chain);
  return <Badge className={info.badgeClass}>{info.name}</Badge>;
}

/** Keparahan temuan; warna dan ikonnya sama dengan tingkat risiko yang setara. */
export function SeverityBadge({ severity }: { severity: RiskSeverity }) {
  const meta = SEVERITY_META[severity];
  const Icon = SEVERITY_ICONS[severity];
  return (
    <Badge className={meta.className}>
      <Icon className="size-3 shrink-0" aria-hidden />
      {meta.label}
    </Badge>
  );
}

export function RiskLevelBadge({ level }: { level: RiskLevel }) {
  const meta = RISK_LEVEL_META[level];
  const Icon = RISK_LEVEL_ICONS[level];
  return (
    <Badge className={meta.className}>
      <Icon className="size-3 shrink-0" aria-hidden />
      {meta.label}
    </Badge>
  );
}

export { EntityLabelBadge } from "./entity-label-badge";
