/**
 * Logika blok Ringkasan Token: mengubah data investigasi menjadi beberapa
 * kalimat sorotan yang menjawab "apa yang terjadi pada token ini?".
 *
 * Setiap sorotan membawa tag klasifikasi supaya user tahu asal datanya.
 * Angka turunan (rasio, persentase) dihitung dari data snapshot yang sama.
 */
import { getChain } from "./chains";
import {
  formatAge,
  formatDate,
  formatNumber,
  formatPct,
  formatUsdCompact,
} from "./format";
import { SEVERITY_META } from "./labels";
import type {
  FindingClassification,
  RiskFinding,
  RiskSeverity,
  TokenInvestigation,
} from "./types";

export interface TokenHighlight {
  id: string;
  text: string;
  /** Kosong bila sorotan merangkum beberapa jenis data sekaligus. */
  classification?: FindingClassification;
}

const SEVERITY_ORDER: RiskSeverity[] = ["critical", "high", "medium", "low", "info"];

/** Jumlah temuan per tingkat keparahan, urut dari yang paling parah. */
export function countFindingsBySeverity(
  findings: RiskFinding[],
): Array<{ severity: RiskSeverity; count: number }> {
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    count: findings.filter((finding) => finding.severity === severity).length,
  })).filter((item) => item.count > 0);
}

/** "2 tinggi, 2 sedang, 1 rendah" */
function describeSeverityCounts(findings: RiskFinding[]): string {
  return countFindingsBySeverity(findings)
    .map(({ severity, count }) => `${count} ${SEVERITY_META[severity].label.toLowerCase()}`)
    .join(", ");
}

export function buildTokenHighlights(data: TokenInvestigation): TokenHighlight[] {
  const { token, market, risk, holders, snapshot } = data;
  const chain = getChain(token.chain);
  const highlights: TokenHighlight[] = [];

  highlights.push({
    id: "age",
    text: `Token berumur ${formatAge(token.deployedAt, snapshot.fetchedAt)}, dideploy ${formatDate(token.deployedAt)}.`,
    classification: "fact",
  });

  if (market.marketCapUsd > 0 && market.liquidityUsd > 0) {
    const ratio = (market.liquidityUsd / market.marketCapUsd) * 100;
    highlights.push({
      id: "liquidity-ratio",
      text: `Likuiditas ${formatUsdCompact(market.liquidityUsd)}, setara ${formatPct(ratio, { maximumFractionDigits: 1 })} dari market cap.`,
      classification: "calculation",
    });
  }

  if (market.liquidityUsd > 0 && market.volume24hUsd > 0) {
    const turnover = market.volume24hUsd / market.liquidityUsd;
    highlights.push({
      id: "turnover",
      text: `Volume 24 jam ${formatUsdCompact(market.volume24hUsd)}, sekitar ${formatNumber(turnover, 1)}x likuiditas.`,
      classification: "calculation",
    });
  }

  if (holders.top.length > 0) {
    const poolShare = holders.top
      .filter((holder) => holder.label?.type === "liquidity_pool")
      .reduce((sum, holder) => sum + holder.sharePct, 0);
    const poolNote =
      poolShare > 0
        ? `, termasuk pool likuiditas ${formatPct(poolShare, { maximumFractionDigits: 1 })}`
        : "";
    highlights.push({
      id: "concentration",
      text: `10 holder teratas menguasai ${formatPct(holders.concentration.top10Pct, { maximumFractionDigits: 1 })} supply${poolNote}.`,
      classification: holders.concentration.classification,
    });
  }

  highlights.push(
    risk.findings.length > 0
      ? {
          id: "findings",
          text: `${risk.findings.length} temuan risiko: ${describeSeverityCounts(risk.findings)}.`,
        }
      : {
          id: "findings",
          text: "Belum ada temuan risiko pada snapshot ini.",
        },
  );

  // Verifikasi source code hanya relevan untuk kontrak EVM.
  if (chain.addressFormat === "evm") {
    highlights.push({
      id: "verification",
      text: token.verified
        ? `Source code kontrak terverifikasi di ${chain.explorer.name}.`
        : `Source code kontrak belum terverifikasi di ${chain.explorer.name}, jadi isi kontrak belum bisa dibaca.`,
      classification: "external_label",
    });
  }

  return highlights;
}

export interface SectionLink {
  href: `#${string}`;
  label: string;
  count: number;
}

/** Tautan lompat ke bagian halaman beserta jumlah isinya. */
export function buildSectionLinks(data: TokenInvestigation): SectionLink[] {
  return [
    { href: "#risiko", label: "Risiko", count: data.risk.findings.length },
    { href: "#pemegang", label: "Pemegang", count: data.holders.top.length },
    { href: "#aktivitas", label: "Aktivitas", count: data.activity.length },
    { href: "#bukti", label: "Bukti", count: data.evidence.length },
  ];
}
