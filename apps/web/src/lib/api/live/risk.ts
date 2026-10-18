/**
 * Penilaian risiko objek dari API: ringkasan (`/api/risk/:chain/:address`)
 * dan temuannya (`/findings`). Skor kosong berarti belum bisa dinilai, bukan
 * aman. Rincian transaksi bukti diambil untuk hash yang tersimpan.
 */
import type { CaseDataStatus, ChainId, DangerTrait, DangerTraitCheck, ObjectRisk, RiskLabel, RiskLevel, RiskObjectKind, RiskObjectLink, RiskReason, RiskSeverity, RiskWarning } from "../../types";
import { apiJsonOrNull, seg } from "../http";
import { toEntityLabel, toFindingClassification, type ApiLabel } from "./common";
import { fetchTxEvidence } from "./evidence";

export interface ApiRiskSummary {
  objectKind: RiskObjectKind;
  title: string;
  label: (ApiLabel & { classification?: string; confidence?: number | null }) | null;
  score: number | null;
  level: RiskLevel;
  snapshot: { blockNumber: number; fetchedAt: string; assessedAt: string; sources: string[]; dataStatus: CaseDataStatus; statusReason: string | null };
  links: Array<{ kind: RiskObjectLink["kind"]; href: string }>;
}

export interface ApiRiskFindingsFull {
  findings: Array<{
    id: string;
    kind: "reason" | "warning";
    title: string;
    description: string;
    severity: RiskSeverity;
    classification: string;
    points: number | null;
    trait: DangerTrait | null;
    detectedAt: string | null;
    evidence: Array<{ chain: string; txHash: string; stored: boolean }>;
  }>;
  traits: Array<{ trait: DangerTrait; status: DangerTraitCheck["status"]; note: string | null; finding: { kind: "reason" | "warning"; id: string } | null }>;
}

const LINK_TITLE: Record<RiskObjectLink["kind"], string> = {
  token: "Halaman token",
  flow: "Aliran dana",
  map: "Peta hubungan wallet",
  multichain: "Jelajah multichain",
};

const hashes = (evidence: Array<{ txHash: string }>) => [...new Set(evidence.map((item) => item.txHash))];

export function toObjectRisk(chain: ChainId, address: string, summary: ApiRiskSummary, findings: ApiRiskFindingsFull | null): Omit<ObjectRisk, "evidence"> {
  const reasons: RiskReason[] = [];
  const warnings: RiskWarning[] = [];
  for (const finding of findings?.findings ?? []) {
    const base = {
      id: finding.id,
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      classification: toFindingClassification(finding.classification),
      evidenceTxHashes: hashes(finding.evidence),
    };
    if (finding.kind === "reason") reasons.push({ ...base, points: finding.points });
    else warnings.push({ ...base, trait: finding.trait, detectedAt: finding.detectedAt ?? summary.snapshot.assessedAt });
  }
  const traitChecks: DangerTraitCheck[] = (findings?.traits ?? []).map((trait) => ({
    trait: trait.trait,
    status: trait.status,
    ...(trait.note ? { note: trait.note } : {}),
    ...(trait.finding?.kind === "warning" ? { warningId: trait.finding.id } : {}),
    ...(trait.finding?.kind === "reason" ? { reasonId: trait.finding.id } : {}),
  }));
  const entity = toEntityLabel(summary.label);
  const labels: RiskLabel[] = entity
    ? [
        {
          ...entity,
          ...(summary.label?.confidence != null ? { confidence: summary.label.confidence } : {}),
          basis: entity.source === "external" ? `Label dari ${entity.sourceName}; bisa keliru dan bukan bukti kepemilikan.` : "Dugaan OpenChain dari pola data tersimpan.",
          addedAt: summary.snapshot.fetchedAt,
          evidenceTxHashes: [],
        },
      ]
    : [];
  return {
    kind: summary.objectKind,
    chain,
    address,
    title: summary.title,
    score: summary.score,
    level: summary.level,
    reasons,
    warnings,
    traitChecks,
    labels,
    links: summary.links.map((link) => ({ kind: link.kind, title: LINK_TITLE[link.kind], href: link.href })),
    snapshot: {
      fetchedAt: summary.snapshot.fetchedAt,
      blockNumber: summary.snapshot.blockNumber,
      sources: summary.snapshot.sources,
      dataStatus: summary.snapshot.dataStatus,
      ...(summary.snapshot.statusReason ? { statusReason: summary.snapshot.statusReason } : {}),
    },
  };
}

export async function getObjectRisk(chain: ChainId, address: string): Promise<ObjectRisk | null> {
  const base = `/risk/${seg(chain)}/${seg(address)}`;
  const summary = await apiJsonOrNull<ApiRiskSummary>(base);
  if (!summary) return null;
  const findings = await apiJsonOrNull<ApiRiskFindingsFull>(`${base}/findings`);
  const risk = toObjectRisk(chain, address, summary, findings);
  const stored = (findings?.findings ?? []).flatMap((finding) => finding.evidence.filter((item) => item.stored && item.chain === chain).map((item) => ({ chain, txHash: item.txHash })));
  return { ...risk, evidence: await fetchTxEvidence(stored) };
}
