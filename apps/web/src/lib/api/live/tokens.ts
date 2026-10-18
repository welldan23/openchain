/**
 * Halaman token dari API: ringkasan, cek kontrak, holder, bukti, dan
 * penilaian risiko. Nilai yang belum tersedia dari provider tetap kosong
 * (`null`), tidak diisi tebakan. Aktivitas token belum punya endpoint, jadi
 * daftarnya kosong dan panelnya menjelaskan itu.
 */
import type {
  CaseDataStatus,
  ChainId,
  ContractCheckItem,
  EvidenceItem,
  RiskFinding,
  RiskLevel,
  RiskSeverity,
  TokenHolder,
  TokenInvestigation,
} from "../../types";
import { apiJson, apiJsonOrNull, seg } from "../http";
import { toEntityLabel, toFindingClassification, toNumber, type ApiLabel } from "./common";

interface ApiSnapshotHeader {
  blockNumber: number;
  fetchedAt: string;
  dataStatus: CaseDataStatus;
  sources?: Array<{ provider: string; status: string; errorReason: string | null }>;
}

export interface ApiTokenSummary {
  token: {
    address: string;
    standard: string;
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    totalSupply: string | null;
    deployer: string | null;
    deployedAt: string | null;
    deployTxHash: string | null;
    sourceVerified: boolean | null;
  };
  snapshot: ApiSnapshotHeader | null;
  dataStatus: CaseDataStatus;
  market: Record<"priceUsd" | "priceChange24hPct" | "marketCapUsd" | "fdvUsd" | "liquidityUsd" | "volume24hUsd" | "holderCount" | "txCount24h", number | null> | null;
}

interface ApiEvidence {
  classification: string;
  explanation: string;
  txHash: string | null;
  blockTimestamp: string | null;
  fetchedAt: string;
  relatedFindings?: string[];
}

export interface ApiContractChecks {
  token: { standardLabel: string };
  checks: Array<{ code: string; label: string; status: ContractCheckItem["status"]; value: string; description: string | null; classification: string | null; evidence: ApiEvidence[] }>;
}

export interface ApiHolders {
  holderCount: number | null;
  concentration: { top10Pct: number | null; top50Pct: number | null; classification: string } | null;
  holders: Array<{ rank: number; address: string; balance: string | null; sharePct: number; labels: ApiLabel[] }>;
}

export interface ApiEvidenceList {
  evidence: ApiEvidence[];
}

export interface ApiRiskFindings {
  score: number | null;
  level: RiskLevel;
  findings: Array<{ id: string; kind: "reason" | "warning"; title: string; description: string; severity: RiskSeverity; classification: string; evidence: Array<{ txHash: string }> }>;
}

const hashesOf = (evidence: Array<{ txHash: string | null }>): string[] => [...new Set(evidence.map((item) => item.txHash).filter((hash): hash is string => Boolean(hash)))];

/** Ringkasan status data dan provider yang gagal, untuk pemberitahuan di halaman. */
function statusReasonOf(snapshot: ApiSnapshotHeader | null): string | undefined {
  const failed = (snapshot?.sources ?? []).filter((source) => source.status !== "complete" && source.errorReason);
  if (failed.length === 0) return undefined;
  return failed.map((source) => `${source.provider}: ${source.errorReason}`).filter((item, index, all) => all.indexOf(item) === index).join("; ");
}

export function toTokenInvestigation(
  chain: ChainId,
  summary: ApiTokenSummary,
  checks: ApiContractChecks | null,
  holders: ApiHolders | null,
  evidence: ApiEvidenceList | null,
  risk: ApiRiskFindings | null,
): TokenInvestigation {
  const { token, snapshot, market } = summary;
  const findings: RiskFinding[] = (risk?.findings ?? []).map((finding) => ({
    id: finding.id,
    title: finding.title,
    description: finding.description,
    severity: finding.severity,
    classification: toFindingClassification(finding.classification),
    evidenceTxHashes: hashesOf(finding.evidence),
  }));
  const top: TokenHolder[] = (holders?.holders ?? []).map((holder) => ({
    rank: holder.rank,
    address: holder.address,
    label: toEntityLabel(holder.labels[0]),
    balance: toNumber(holder.balance),
    sharePct: holder.sharePct,
  }));
  // Panel bukti menampilkan bukti transaksi; bukti state dan label eksternal sudah tampil di cek kontrak.
  const txEvidence = new Map<string, EvidenceItem>();
  for (const item of evidence?.evidence ?? []) {
    if (!item.txHash || txEvidence.has(item.txHash)) continue;
    txEvidence.set(item.txHash, {
      txHash: item.txHash,
      timestamp: item.blockTimestamp ?? item.fetchedAt,
      summary: item.explanation,
      classification: toFindingClassification(item.classification),
      relatedFindingIds: item.relatedFindings ?? [],
    });
  }
  return {
    token: {
      chain,
      address: token.address,
      name: token.name ?? "Token tanpa nama",
      symbol: token.symbol ?? "?",
      decimals: token.decimals,
      totalSupply: toNumber(token.totalSupply),
      deployer: token.deployer,
      deployedAt: token.deployedAt,
      deployTxHash: token.deployTxHash,
      verified: token.sourceVerified,
    },
    market: {
      priceUsd: market?.priceUsd ?? null,
      priceChange24hPct: market?.priceChange24hPct ?? null,
      marketCapUsd: market?.marketCapUsd ?? null,
      fdvUsd: market?.fdvUsd ?? null,
      liquidityUsd: market?.liquidityUsd ?? null,
      volume24hUsd: market?.volume24hUsd ?? null,
      holderCount: holders?.holderCount ?? market?.holderCount ?? null,
      txCount24h: market?.txCount24h ?? null,
    },
    risk: { score: risk?.score ?? null, level: risk?.level ?? "unknown", findings },
    contract: {
      standard: checks?.token.standardLabel ?? token.standard.toUpperCase(),
      items: (checks?.checks ?? []).map((check) => ({
        id: check.code,
        label: check.label,
        status: check.status,
        value: check.value,
        ...(check.description ? { description: check.description } : {}),
        ...(check.status === "unknown" || !check.classification ? {} : { classification: toFindingClassification(check.classification) }),
        evidenceTxHashes: hashesOf(check.evidence),
      })),
    },
    holders: {
      concentration: {
        top10Pct: holders?.concentration?.top10Pct ?? null,
        top50Pct: holders?.concentration?.top50Pct ?? null,
        classification: toFindingClassification(holders?.concentration?.classification ?? "derived_metric"),
      },
      top,
    },
    activity: [],
    evidence: [...txEvidence.values()],
    snapshot: {
      fetchedAt: snapshot?.fetchedAt ?? new Date(0).toISOString(),
      blockNumber: snapshot?.blockNumber ?? 0,
      sources: [...new Set((snapshot?.sources ?? []).map((source) => source.provider))],
      dataStatus: snapshot ? summary.dataStatus : "unavailable",
      ...(snapshot ? (statusReasonOf(snapshot) ? { statusReason: statusReasonOf(snapshot) } : {}) : { statusReason: "Token ini belum pernah diambil datanya." }),
    },
  };
}

export async function getTokenInvestigation(chain: ChainId, address: string): Promise<TokenInvestigation | null> {
  const base = `/tokens/${seg(chain)}/${seg(address)}`;
  const summary = await apiJsonOrNull<ApiTokenSummary>(`${base}/summary`);
  if (!summary) return null;
  const [checks, holders, evidence, risk] = await Promise.all([
    apiJsonOrNull<ApiContractChecks>(`${base}/contract-checks`),
    apiJsonOrNull<ApiHolders>(`${base}/holders`, { query: { limit: 50 } }),
    apiJsonOrNull<ApiEvidenceList>(`${base}/evidence`),
    // Penilaian risiko dibuat dari data tersimpan; bila gagal, panel risiko tampil "belum dinilai".
    apiJson<ApiRiskFindings>(`/risk/${seg(chain)}/${seg(address)}/findings`).catch(() => null),
  ]);
  return toTokenInvestigation(chain, summary, checks, holders, evidence, risk);
}
