import { getChain } from "@/lib/chains";
import { RISK_LEVEL_META, SEVERITY_META } from "@/lib/labels";
import type { ChainId, RiskLevel, RiskSeverity } from "@/lib/types";
import { Badge } from "./ui/badge";

export function ChainBadge({ chain }: { chain: ChainId }) {
  const info = getChain(chain);
  return <Badge className={info.badgeClass}>{info.name}</Badge>;
}

export function SeverityBadge({ severity }: { severity: RiskSeverity }) {
  const meta = SEVERITY_META[severity];
  return <Badge className={meta.className}>{meta.label}</Badge>;
}

export function RiskLevelBadge({ level }: { level: RiskLevel }) {
  const meta = RISK_LEVEL_META[level];
  return <Badge className={meta.className}>{meta.label}</Badge>;
}

export { EntityLabelBadge } from "./entity-label-badge";
