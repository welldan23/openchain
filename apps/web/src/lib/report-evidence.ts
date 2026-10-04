/**
 * Bukti transaksi di laporan: semua hash dari klaim dan bukti tersemat,
 * dengan klaim yang mengutipnya dan tangkapan data (kapan, di blok berapa,
 * dari provider mana) yang dipakai laporan. Hash tanpa rincian tersimpan
 * tetap tampil apa adanya.
 */
import type { ChainId, InvestigationReport, ReportBlock, TxEvidence } from "./types";

export const EVIDENCE_SECTION = { id: "bukti", title: "Bukti utama" } as const;

export interface ReportEvidenceEntry {
  txHash: string;
  /** `null` bila chain-nya tidak bisa dipastikan dari data laporan. */
  chain: ChainId | null;
  detail: TxEvidence | null;
  citedBy: Array<{ blockId: string; title: string }>;
  /** Blok bukti tersemat untuk hash ini, bila ada. */
  embeddedBlockId: string | null;
  capture: { fetchedAt: string; blockNumber: number | null; sources: string[] };
}

export type EvidenceFilter = "all" | "not_embedded" | "no_detail";

export function reportEvidenceEntries(report: InvestigationReport): ReportEvidenceEntry[] {
  const byHash = new Map<string, ReportEvidenceEntry>();
  const details = new Map(report.evidence.map((item) => [item.txHash.toLowerCase(), item]));
  // Hash klaim tidak menyebut chain; hanya bisa dipastikan bila laporan memakai satu chain saja.
  const onlyChain = report.snapshot.blocks.length === 1 ? report.snapshot.blocks[0].chain : null;
  const entry = (txHash: string, chain: ChainId | null): ReportEvidenceEntry => {
    const key = txHash.toLowerCase();
    let found = byHash.get(key);
    if (!found) {
      const detail = details.get(key) ?? null;
      const resolved = detail?.chain ?? chain ?? onlyChain;
      found = {
        txHash,
        chain: resolved,
        detail,
        citedBy: [],
        embeddedBlockId: null,
        capture: {
          fetchedAt: report.snapshot.fetchedAt,
          blockNumber: report.snapshot.blocks.find((block) => block.chain === resolved)?.blockNumber ?? null,
          sources: report.snapshot.sources,
        },
      };
      byHash.set(key, found);
    }
    return found;
  };
  for (const block of report.sections.flatMap((section) => section.blocks)) {
    if (block.kind === "claim") {
      for (const hash of block.claim.evidenceTxHashes) {
        const found = entry(hash, null);
        if (!found.citedBy.some((item) => item.blockId === block.id)) found.citedBy.push({ blockId: block.id, title: block.claim.title });
      }
    }
    if (block.kind === "evidence") entry(block.txHash, block.chain).embeddedBlockId ??= block.id;
  }
  // Urut waktu transaksi; hash tanpa rincian di akhir, sesuai urutan kemunculan.
  const entries = [...byHash.values()];
  const position = new Map(entries.map((item, index) => [item.txHash, index]));
  return entries.sort((a, b) => {
    if (a.detail && b.detail) return Date.parse(a.detail.timestamp) - Date.parse(b.detail.timestamp) || position.get(a.txHash)! - position.get(b.txHash)!;
    return Number(a.detail === null) - Number(b.detail === null) || position.get(a.txHash)! - position.get(b.txHash)!;
  });
}

export function filterEvidenceEntries(entries: ReportEvidenceEntry[], filter: EvidenceFilter): ReportEvidenceEntry[] {
  if (filter === "not_embedded") return entries.filter((item) => item.embeddedBlockId === null);
  if (filter === "no_detail") return entries.filter((item) => item.detail === null);
  return entries;
}

export function evidenceBlockId(txHash: string): string {
  return `bukti-${txHash.toLowerCase().replace(/^0x/, "").slice(0, 16)}`;
}

/**
 * Sematkan satu hash sebagai bukti di bagian "Bukti utama" (dibuat di akhir
 * bila belum ada). Hash yang sudah tersemat atau chain-nya tidak diketahui
 * tidak mengubah laporan.
 */
export function embedEvidence(report: InvestigationReport, entry: ReportEvidenceEntry, updatedAt: string): { report: InvestigationReport; blockId: string | null } {
  if (entry.embeddedBlockId) return { report, blockId: entry.embeddedBlockId };
  if (!entry.chain) return { report, blockId: null };
  const caption = entry.citedBy.length > 0 ? `Bukti untuk: ${entry.citedBy.map((item) => item.title).join("; ")}.` : "Bukti transaksi.";
  const block: ReportBlock = { kind: "evidence", id: evidenceBlockId(entry.txHash), chain: entry.chain, txHash: entry.txHash, caption };
  const exists = report.sections.some((section) => section.id === EVIDENCE_SECTION.id);
  const sections = exists
    ? report.sections.map((section) => (section.id === EVIDENCE_SECTION.id ? { ...section, blocks: [...section.blocks, block] } : section))
    : [...report.sections, { id: EVIDENCE_SECTION.id, title: EVIDENCE_SECTION.title, blocks: [block] }];
  return { report: { ...report, sections, updatedAt }, blockId: block.id };
}
