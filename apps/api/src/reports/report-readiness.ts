/**
 * Kesiapan laporan, murni dan sama dengan aturan frontend: setiap klaim wajib
 * menyebut provider dan waktu datanya; klaim fakta atau kalkulasi wajib punya
 * hash bukti. Kekurangan dilaporkan sebagai masalah, tidak diisi tebakan.
 * Laporan hanya bisa difinalkan tanpa masalah `blocker`.
 */
import type { DataStatus, InfoClassification } from '../database/schema/enums.js';
import type { ReportIssue, ReportSectionView } from './reports.types.js';

/** Klaim yang wajib punya hash: fakta on-chain dan kalkulasi dari data on-chain. */
const NEEDS_EVIDENCE: ReadonlySet<InfoClassification> = new Set(['verified_fact', 'derived_metric']);

export interface ReadinessInput {
  sections: ReportSectionView[];
  snapshot: { dataStatus: DataStatus; statusReason: string | null };
}

/** Semua masalah kesiapan, urut sesuai letaknya; snapshot di akhir. `stored` berisi `chain:hash` yang rinciannya tersimpan. */
export function reportIssues(report: ReadinessInput, stored?: ReadonlySet<string>): ReportIssue[] {
  const issues: ReportIssue[] = [];
  for (const section of report.sections) {
    if (section.blocks.length === 0) {
      issues.push({ kind: 'empty_section', level: 'warning', sectionId: section.id, blockId: null, message: `Bagian "${section.title}" masih kosong.` });
    }
    for (const block of section.blocks) {
      const at = { sectionId: section.id, blockId: block.id };
      if (block.kind === 'claim') {
        const { claim } = block;
        if (!claim.provider) issues.push({ kind: 'claim_without_provider', level: 'blocker', ...at, message: `Klaim "${claim.title}" belum menyebut provider datanya.` });
        if (!claim.observedAt) issues.push({ kind: 'claim_without_time', level: 'blocker', ...at, message: `Klaim "${claim.title}" belum punya waktu data.` });
        if (claim.evidence.length === 0) {
          issues.push(
            NEEDS_EVIDENCE.has(claim.classification)
              ? { kind: 'fact_without_evidence', level: 'blocker', ...at, message: `Klaim "${claim.title}" disebut fakta/kalkulasi tapi belum punya hash bukti.` }
              : { kind: 'claim_without_evidence', level: 'warning', ...at, message: `Klaim "${claim.title}" belum punya hash bukti; pembaca akan melihatnya sebagai klaim.` },
          );
        }
      }
      if (block.kind === 'evidence' && stored && !stored.has(`${block.chain}:${block.txHash}`)) {
        issues.push({
          kind: 'evidence_not_stored',
          level: 'warning',
          ...at,
          message: 'Bukti tersemat belum punya rincian tersimpan; pembaca perlu membukanya di explorer.',
        });
      }
    }
  }
  if (report.snapshot.dataStatus !== 'complete') {
    issues.push({ kind: 'snapshot_incomplete', level: 'warning', sectionId: null, blockId: null, message: report.snapshot.statusReason ?? 'Snapshot data laporan tidak lengkap.' });
  }
  return issues;
}

export const blockersOf = (issues: ReportIssue[]) => issues.filter((issue) => issue.level === 'blocker');

/** Hitungan isi: bagian, klaim, dan hash bukti unik dari klaim dan bukti tersemat. */
export function reportStats(sections: ReportSectionView[]) {
  const blocks = sections.flatMap((section) => section.blocks);
  const hashes = new Set(
    blocks.flatMap((block) =>
      block.kind === 'claim'
        ? block.claim.evidence.map((item) => `${item.chain}:${item.txHash}`)
        : block.kind === 'evidence'
          ? [`${block.chain}:${block.txHash}`]
          : [],
    ),
  );
  return { sectionCount: sections.length, claimCount: blocks.filter((block) => block.kind === 'claim').length, evidenceCount: hashes.size };
}
