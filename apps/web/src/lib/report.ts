/**
 * Aturan workspace laporan: hitungan isi dan pemeriksaan kesiapan. Sesuai
 * PRD, setiap klaim penting wajib punya provider, waktu data, dan hash
 * transaksi bila tersedia. Kekurangan ditampilkan sebagai masalah, tidak
 * diisi tebakan.
 */
import { CLASSIFICATION_ORDER } from "./labels";
import type { FindingClassification, InvestigationReport, ReportBlock, ReportClaim, ReportSection } from "./types";

export type ReportIssueKind =
  | "claim_without_provider"
  | "claim_without_time"
  | "fact_without_evidence"
  | "claim_without_evidence"
  | "evidence_not_stored"
  | "empty_section"
  | "snapshot_incomplete";

export interface ReportIssue {
  kind: ReportIssueKind;
  /** `blocker` menghalangi laporan dianggap siap; `warning` cukup diperhatikan. */
  level: "blocker" | "warning";
  sectionId: string | null;
  blockId: string | null;
  message: string;
}

/** Klaim yang wajib punya hash: fakta on-chain dan kalkulasi dari data on-chain. */
const NEEDS_EVIDENCE: ReadonlySet<ReportClaim["classification"]> = new Set(["fact", "calculation"]);

export function reportBlockAnchor(blockId: string): string {
  return `blok-${blockId}`;
}

export function reportSectionAnchor(sectionId: string): string {
  return `bagian-${sectionId}`;
}

function claimIssues(section: ReportSection, block: Extract<ReportBlock, { kind: "claim" }>): ReportIssue[] {
  const { claim } = block;
  const at = { sectionId: section.id, blockId: block.id };
  const issues: ReportIssue[] = [];
  if (!claim.provider) {
    issues.push({ kind: "claim_without_provider", level: "blocker", ...at, message: `Klaim "${claim.title}" belum menyebut provider datanya.` });
  }
  if (!claim.observedAt) {
    issues.push({ kind: "claim_without_time", level: "blocker", ...at, message: `Klaim "${claim.title}" belum punya waktu data.` });
  }
  if (claim.evidenceTxHashes.length === 0) {
    issues.push(
      NEEDS_EVIDENCE.has(claim.classification)
        ? { kind: "fact_without_evidence", level: "blocker", ...at, message: `Klaim "${claim.title}" disebut fakta/kalkulasi tapi belum punya hash bukti.` }
        : { kind: "claim_without_evidence", level: "warning", ...at, message: `Klaim "${claim.title}" belum punya hash bukti; pembaca akan melihatnya sebagai klaim.` },
    );
  }
  return issues;
}

/** Semua masalah kesiapan, urut sesuai letaknya di laporan; snapshot di akhir. */
export function reportIssues(report: InvestigationReport): ReportIssue[] {
  const stored = new Set(report.evidence.map((item) => `${item.chain}:${item.txHash.toLowerCase()}`));
  const issues: ReportIssue[] = [];
  for (const section of report.sections) {
    if (section.blocks.length === 0) {
      issues.push({ kind: "empty_section", level: "warning", sectionId: section.id, blockId: null, message: `Bagian "${section.title}" masih kosong.` });
    }
    for (const block of section.blocks) {
      if (block.kind === "claim") issues.push(...claimIssues(section, block));
      if (block.kind === "evidence" && !stored.has(`${block.chain}:${block.txHash.toLowerCase()}`)) {
        issues.push({
          kind: "evidence_not_stored",
          level: "warning",
          sectionId: section.id,
          blockId: block.id,
          message: "Bukti tersemat belum punya rincian tersimpan; pembaca perlu membukanya di explorer.",
        });
      }
    }
  }
  if (report.snapshot.dataStatus !== "complete") {
    issues.push({
      kind: "snapshot_incomplete",
      level: "warning",
      sectionId: null,
      blockId: null,
      message: report.snapshot.statusReason ?? "Snapshot data laporan tidak lengkap.",
    });
  }
  return issues;
}

export interface ReportStats {
  sectionCount: number;
  claimCount: number;
  noteCount: number;
  /** Hash bukti unik dari klaim dan bukti tersemat. */
  evidenceCount: number;
}

export function reportStats(report: Pick<InvestigationReport, "sections">): ReportStats {
  const blocks = report.sections.flatMap((section) => section.blocks);
  const hashes = new Set(
    blocks.flatMap((block) =>
      block.kind === "claim"
        ? block.claim.evidenceTxHashes.map((hash) => hash.toLowerCase())
        : block.kind === "evidence"
          ? [block.txHash.toLowerCase()]
          : [],
    ),
  );
  return {
    sectionCount: report.sections.length,
    claimCount: blocks.filter((block) => block.kind === "claim").length,
    noteCount: blocks.filter((block) => block.kind === "note").length,
    evidenceCount: hashes.size,
  };
}

/** Daftar isi: tiap bagian dengan jumlah blok dan masalahnya. */
export function reportOutline(report: InvestigationReport, issues: ReportIssue[] = reportIssues(report)) {
  return report.sections.map((section) => ({
    id: section.id,
    title: section.title,
    blockCount: section.blocks.length,
    blockers: issues.filter((issue) => issue.sectionId === section.id && issue.level === "blocker").length,
    warnings: issues.filter((issue) => issue.sectionId === section.id && issue.level === "warning").length,
  }));
}

export interface ReportClaimEntry {
  blockId: string;
  sectionId: string;
  sectionTitle: string;
  claim: ReportClaim;
  /** Provider dan waktu data sudah dicantumkan. */
  hasProvenance: boolean;
  evidenceCount: number;
}

export type ClaimOrder = "document" | "strength";

/** Semua klaim di laporan, urut sesuai letaknya. */
export function reportClaims(report: Pick<InvestigationReport, "sections">): ReportClaimEntry[] {
  return report.sections.flatMap((section) =>
    section.blocks.flatMap((block) =>
      block.kind === "claim"
        ? [
            {
              blockId: block.id,
              sectionId: section.id,
              sectionTitle: section.title,
              claim: block.claim,
              hasProvenance: Boolean(block.claim.provider && block.claim.observedAt),
              evidenceCount: new Set(block.claim.evidenceTxHashes.map((hash) => hash.toLowerCase())).size,
            },
          ]
        : [],
    ),
  );
}

/** Jumlah klaim per jenis informasi, urut dari bukti terkuat; jenis tanpa klaim tidak ikut. */
export function claimClassificationCounts(entries: ReportClaimEntry[]): Array<{ classification: FindingClassification; count: number }> {
  return CLASSIFICATION_ORDER.map((classification) => ({
    classification,
    count: entries.filter((entry) => entry.claim.classification === classification).length,
  })).filter((item) => item.count > 0);
}

/** Saring per jenis (`null` = semua) lalu urutkan; urutan "kekuatan" tetap stabil per letak. */
export function filterClaims(entries: ReportClaimEntry[], classification: FindingClassification | null, order: ClaimOrder): ReportClaimEntry[] {
  const filtered = classification ? entries.filter((entry) => entry.claim.classification === classification) : [...entries];
  if (order === "document") return filtered;
  const position = new Map(entries.map((entry, index) => [entry.blockId, index]));
  return filtered.sort(
    (a, b) =>
      CLASSIFICATION_ORDER.indexOf(a.claim.classification) - CLASSIFICATION_ORDER.indexOf(b.claim.classification) ||
      position.get(a.blockId)! - position.get(b.blockId)!,
  );
}
