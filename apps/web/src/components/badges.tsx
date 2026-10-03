import { getChain } from "@/lib/chains";
import {
  CLASSIFICATION_META,
  ENTITY_LABEL_META,
  RISK_LEVEL_META,
  SEVERITY_META,
} from "@/lib/labels";
import type {
  ChainId,
  EntityLabel,
  FindingClassification,
  RiskLevel,
  RiskSeverity,
} from "@/lib/types";
import { Badge } from "./ui/badge";

export function ChainBadge({ chain }: { chain: ChainId }) {
  const info = getChain(chain);
  return <Badge className={info.badgeClass}>{info.name}</Badge>;
}

/** Tag transparansi: fakta, kalkulasi, heuristic, label eksternal, atau asumsi. */
export function ClassificationBadge({ classification }: { classification: FindingClassification }) {
  const meta = CLASSIFICATION_META[classification];
  return (
    <Badge className={meta.className} title={meta.description}>
      {meta.label}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: RiskSeverity }) {
  const meta = SEVERITY_META[severity];
  return <Badge className={meta.className}>{meta.label}</Badge>;
}

export function RiskLevelBadge({ level }: { level: RiskLevel }) {
  const meta = RISK_LEVEL_META[level];
  return <Badge className={meta.className}>{meta.label}</Badge>;
}

/** Label entitas beserta sumbernya, supaya asal label selalu transparan. */
export function EntityLabelBadge({ label }: { label: EntityLabel }) {
  const meta = ENTITY_LABEL_META[label.type];
  const sourceText = label.source === "external" ? "Label eksternal" : "Heuristic";
  return (
    <Badge className={meta.className} title={`${sourceText} · sumber: ${label.sourceName}`}>
      {label.name ?? meta.label}
      <span className="opacity-70">· {label.source === "external" ? "eksternal" : "heuristic"}</span>
    </Badge>
  );
}
