/**
 * Query laporan bukti. Isi laporan (bagian dan blok) ditulis utuh: bagian dan
 * blok dengan id tersimpan diperbarui di tempat (id dan waktu dibuat tetap),
 * yang baru ditambahkan, yang tidak dikirim lagi dihapus.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { cases, caseSnapshotBlocks, reportBlocks, reportClaimEvidence, reports, reportSections, reportSnapshotBlocks } from '../database/schema/index.js';
import type { BlockInput, SectionInput } from './report-input.js';
import type { ReportBlockView, ReportSectionView } from './reports.types.js';

export type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
export type ReportRow = typeof reports.$inferSelect;
type BlockRow = typeof reportBlocks.$inferSelect;
type EvidenceRow = typeof reportClaimEvidence.$inferSelect;

/** Hash bukti yang chain-nya sudah dipastikan. */
export type ResolvedSection = Omit<SectionInput, 'blocks'> & { blocks: ResolvedBlock[] };
export type ResolvedBlock =
  | Exclude<BlockInput, { kind: 'claim' }>
  | { kind: 'claim'; id: string | null; claim: Omit<Extract<BlockInput, { kind: 'claim' }>['claim'], 'evidence'> & { evidence: Array<{ chain: string; txHash: string }> } };

/** Susun baris bagian dan blok menjadi bentuk kontrak. */
export function toSectionViews(sections: Array<typeof reportSections.$inferSelect>, blocks: BlockRow[], evidence: EvidenceRow[]): ReportSectionView[] {
  const evidenceByBlock = new Map<number, EvidenceRow[]>();
  for (const row of evidence) evidenceByBlock.set(row.blockId, [...(evidenceByBlock.get(row.blockId) ?? []), row]);
  return sections.map((section) => ({
    id: String(section.id),
    title: section.title,
    blocks: blocks.filter((block) => block.sectionId === section.id).map((block) => toBlockView(block, evidenceByBlock.get(block.id) ?? [])),
  }));
}

function toBlockView(block: BlockRow, evidence: EvidenceRow[]): ReportBlockView {
  const id = String(block.id);
  switch (block.kind) {
    case 'paragraph':
      return { kind: 'paragraph', id, text: block.body ?? '' };
    case 'claim': {
      const refs = [...evidence].sort((a, b) => a.position - b.position || a.id - b.id).map((row) => ({ chain: row.chainId, txHash: row.txHash }));
      return {
        kind: 'claim',
        id,
        claim: {
          id,
          title: block.title ?? '',
          detail: block.body ?? '',
          classification: block.classification!,
          provider: block.provider,
          observedAt: block.observedAt?.toISOString() ?? null,
          evidence: refs,
          evidenceTxHashes: refs.map((ref) => ref.txHash),
          sourceKey: block.sourceKey,
        },
      };
    }
    case 'evidence':
      return { kind: 'evidence', id, chain: block.chainId!, txHash: block.txHash!, caption: block.caption ?? '' };
    case 'note':
      return {
        kind: 'note',
        id,
        body: block.body ?? '',
        createdAt: block.createdAt.toISOString(),
        editedAt: block.editedAt?.toISOString() ?? null,
        claimBlockId: block.claimBlockId === null ? null : String(block.claimBlockId),
      };
    case 'entity':
      return {
        kind: 'entity',
        id,
        subject: { kind: block.entityKind!, chain: block.chainId, address: block.address!, title: block.title ?? '', href: block.href! },
        sourceKey: block.sourceKey,
      };
  }
}

/** Kolom blok menurut jenisnya; kolom jenis lain dikosongkan. */
function blockColumns(block: ResolvedBlock) {
  const empty = {
    title: null,
    body: null,
    classification: null,
    provider: null,
    observedAt: null,
    chainId: null,
    txHash: null,
    caption: null,
    entityKind: null,
    address: null,
    href: null,
    claimBlockId: null,
  };
  switch (block.kind) {
    case 'paragraph':
      return { ...empty, body: block.text };
    case 'claim':
      return {
        ...empty,
        title: block.claim.title,
        body: block.claim.detail,
        classification: block.claim.classification,
        provider: block.claim.provider,
        observedAt: block.claim.observedAt,
      };
    case 'evidence':
      return { ...empty, chainId: block.chain, txHash: block.txHash, caption: block.caption };
    case 'note':
      return { ...empty, body: block.body };
    case 'entity':
      return { ...empty, entityKind: block.subject.kind, chainId: block.subject.chain, address: block.subject.address, title: block.subject.title, href: block.subject.href };
  }
}

@Injectable()
export class ReportsRepository {
  constructor(@Inject(DATABASE) readonly db: Database) {}

  async list(): Promise<ReportRow[]> {
    return this.db.select().from(reports).orderBy(desc(reports.updatedAt), desc(reports.id));
  }

  async find(id: number, executor: Executor = this.db): Promise<ReportRow | null> {
    const [row] = await executor.select().from(reports).where(eq(reports.id, id)).limit(1);
    return row ?? null;
  }

  /** Bagian dan blok beberapa laporan sekaligus, sudah berurutan. */
  async sectionsOf(reportIds: number[], executor: Executor = this.db): Promise<Map<number, ReportSectionView[]>> {
    const result = new Map<number, ReportSectionView[]>(reportIds.map((id) => [id, []]));
    if (reportIds.length === 0) return result;
    const [sections, blocks] = await Promise.all([
      executor.select().from(reportSections).where(inArray(reportSections.reportId, reportIds)).orderBy(asc(reportSections.position), asc(reportSections.id)),
      executor.select().from(reportBlocks).where(inArray(reportBlocks.reportId, reportIds)).orderBy(asc(reportBlocks.position), asc(reportBlocks.id)),
    ]);
    const claimIds = blocks.filter((block) => block.kind === 'claim').map((block) => block.id);
    const evidence = claimIds.length === 0 ? [] : await executor.select().from(reportClaimEvidence).where(inArray(reportClaimEvidence.blockId, claimIds));
    for (const id of reportIds) {
      result.set(
        id,
        toSectionViews(
          sections.filter((section) => section.reportId === id),
          blocks.filter((block) => block.reportId === id),
          evidence,
        ),
      );
    }
    return result;
  }

  async snapshotBlocks(reportId: number): Promise<Array<{ chainId: string; blockNumber: number }>> {
    return this.db
      .select({ chainId: reportSnapshotBlocks.chainId, blockNumber: reportSnapshotBlocks.blockNumber })
      .from(reportSnapshotBlocks)
      .where(eq(reportSnapshotBlocks.reportId, reportId))
      .orderBy(asc(reportSnapshotBlocks.chainId));
  }

  async findCase(id: number) {
    const [row] = await this.db.select().from(cases).where(eq(cases.id, id)).limit(1);
    if (!row) return null;
    const blocks = await this.db
      .select({ chainId: caseSnapshotBlocks.chainId, blockNumber: caseSnapshotBlocks.blockNumber })
      .from(caseSnapshotBlocks)
      .where(eq(caseSnapshotBlocks.caseId, id));
    return { row, blocks };
  }

  async insertReport(executor: Executor, values: typeof reports.$inferInsert, blocks: Array<{ chainId: string; blockNumber: number }>): Promise<ReportRow> {
    const [row] = await executor.insert(reports).values(values).returning();
    if (blocks.length > 0) await executor.insert(reportSnapshotBlocks).values(blocks.map((block) => ({ reportId: row.id, ...block })));
    return row;
  }

  async updateReport(executor: Executor, id: number, values: Partial<typeof reports.$inferInsert>): Promise<void> {
    await executor.update(reports).set(values).where(eq(reports.id, id));
  }

  async remove(id: number): Promise<boolean> {
    const deleted = await this.db.delete(reports).where(eq(reports.id, id)).returning({ id: reports.id });
    return deleted.length > 0;
  }

  /**
   * Tambahkan blok di akhir bagian berjudul `sectionTitle`; bagian dibuat
   * bila belum ada, di posisi `insertAt`. Menjawab id blok baru.
   */
  async appendBlocks(
    executor: Executor,
    reportId: number,
    sectionTitle: string,
    blocks: Array<ResolvedBlock & { sourceKey: string }>,
    insertAt: (titles: string[]) => number,
    now: Date,
  ): Promise<number[]> {
    if (blocks.length === 0) return [];
    const sections = await executor
      .select()
      .from(reportSections)
      .where(eq(reportSections.reportId, reportId))
      .orderBy(asc(reportSections.position), asc(reportSections.id));
    let section = sections.find((row) => row.title === sectionTitle);
    if (!section) {
      [section] = await executor.insert(reportSections).values({ reportId, title: sectionTitle, position: 0 }).returning();
      const ordered = [...sections];
      ordered.splice(insertAt(sections.map((row) => row.title)), 0, section);
      for (const [position, row] of ordered.entries()) {
        await executor.update(reportSections).set({ position }).where(eq(reportSections.id, row.id));
      }
    }
    const sectionId = section.id;
    const existing = await executor.select({ position: reportBlocks.position }).from(reportBlocks).where(eq(reportBlocks.sectionId, sectionId));
    let position = existing.reduce((max, row) => Math.max(max, row.position), -1);
    const ids: number[] = [];
    for (const block of blocks) {
      position += 1;
      const [row] = await executor
        .insert(reportBlocks)
        .values({ ...blockColumns(block), reportId, sectionId, kind: block.kind, position, sourceKey: block.sourceKey, createdAt: now })
        .returning({ id: reportBlocks.id });
      if (block.kind === 'claim' && block.claim.evidence.length > 0) {
        await executor
          .insert(reportClaimEvidence)
          .values(block.claim.evidence.map((ref, index) => ({ blockId: row.id, chainId: ref.chain, txHash: ref.txHash, position: index })));
      }
      ids.push(row.id);
    }
    return ids;
  }

  /** Kunci asal blok yang sudah ada di laporan. */
  async sourceKeys(reportId: number): Promise<Set<string>> {
    const rows = await this.db.select({ sourceKey: reportBlocks.sourceKey }).from(reportBlocks).where(eq(reportBlocks.reportId, reportId));
    return new Set(rows.flatMap((row) => (row.sourceKey === null ? [] : [row.sourceKey])));
  }

  /** Tulis isi laporan utuh. Id klien yang cocok dengan id tersimpan laporan ini memperbarui baris itu. */
  async writeSections(executor: Executor, reportId: number, sections: ResolvedSection[], now: Date): Promise<void> {
    const [existingSections, existingBlocks] = await Promise.all([
      executor.select().from(reportSections).where(eq(reportSections.reportId, reportId)),
      executor.select().from(reportBlocks).where(eq(reportBlocks.reportId, reportId)),
    ]);
    const sectionById = new Map(existingSections.map((row) => [String(row.id), row]));
    const blockById = new Map(existingBlocks.map((row) => [String(row.id), row]));
    const keptSections: number[] = [];
    const keptBlocks: number[] = [];
    const serverIdOf = new Map<string, number>();
    const notes: Array<{ blockId: number; claimBlockId: string | null }> = [];

    for (const [sectionPosition, section] of sections.entries()) {
      const existingSection = section.id === null ? undefined : sectionById.get(section.id);
      let sectionId: number;
      if (existingSection) {
        await executor.update(reportSections).set({ title: section.title, position: sectionPosition }).where(eq(reportSections.id, existingSection.id));
        sectionId = existingSection.id;
      } else {
        const [row] = await executor.insert(reportSections).values({ reportId, title: section.title, position: sectionPosition }).returning({ id: reportSections.id });
        sectionId = row.id;
      }
      keptSections.push(sectionId);

      for (const [position, block] of section.blocks.entries()) {
        const existing = block.id === null ? undefined : blockById.get(block.id);
        const columns = { ...blockColumns(block), sectionId, position };
        let blockId: number;
        if (existing && existing.kind === block.kind) {
          const editedAt = block.kind === 'note' && existing.body !== block.body ? now : existing.editedAt;
          await executor
            .update(reportBlocks)
            .set({ ...columns, editedAt })
            .where(eq(reportBlocks.id, existing.id));
          blockId = existing.id;
        } else {
          const [row] = await executor
            .insert(reportBlocks)
            .values({ ...columns, reportId, kind: block.kind, createdAt: now })
            .returning({ id: reportBlocks.id });
          blockId = row.id;
        }
        keptBlocks.push(blockId);
        if (block.id !== null) serverIdOf.set(block.id, blockId);
        if (block.kind === 'note') notes.push({ blockId, claimBlockId: block.claimBlockId });
        if (block.kind === 'claim') {
          await executor.delete(reportClaimEvidence).where(eq(reportClaimEvidence.blockId, blockId));
          if (block.claim.evidence.length > 0) {
            await executor
              .insert(reportClaimEvidence)
              .values(block.claim.evidence.map((ref, index) => ({ blockId, chainId: ref.chain, txHash: ref.txHash, position: index })));
          }
        }
      }
    }

    // Rujukan catatan ke klaim memakai id klien, jadi diisi setelah semua blok punya id tersimpan.
    for (const note of notes) {
      const claimBlockId = note.claimBlockId === null ? null : (serverIdOf.get(note.claimBlockId) ?? null);
      await executor.update(reportBlocks).set({ claimBlockId }).where(eq(reportBlocks.id, note.blockId));
    }
    await executor
      .delete(reportBlocks)
      .where(keptBlocks.length > 0 ? and(eq(reportBlocks.reportId, reportId), notInArray(reportBlocks.id, keptBlocks)) : eq(reportBlocks.reportId, reportId));
    await executor
      .delete(reportSections)
      .where(keptSections.length > 0 ? and(eq(reportSections.reportId, reportId), notInArray(reportSections.id, keptSections)) : eq(reportSections.reportId, reportId));
  }
}
