/**
 * Laporan bukti investigasi: daftar, detail (beserta bukti transaksi dari data
 * tersimpan dan kesiapannya), buat, ubah, hapus. Laporan dari kasus menyalin
 * judul dan snapshot data kasusnya. Laporan final dikunci; finalisasi
 * ditolak selama masih ada masalah `blocker`. Laporan milik satu akun: daftar
 * dan pembuatan memakai pemiliknya, laporan hanya bisa dibuat dari kasus milik
 * akun yang sama, dan controller memanggil `assertOwned` sebelum memakai id.
 */
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { storedTxEvidence } from '../cases/case-evidence.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { FlowsRepository } from '../flows/flows.repository.js';
import { explorerEvidenceUrl } from '../tokens/evidence.view.js';
import type { NewReportInput, ReportUpdateInput, SectionInput } from './report-input.js';
import { blockersOf, reportIssues, reportStats } from './report-readiness.js';
import { ReportsRepository, type Executor, type ReportRow, type ResolvedSection } from './reports.repository.js';
import type { ReportSummaryView, ReportView } from './reports.types.js';

const NO_CASE_REASON = 'Laporan ini belum memakai snapshot data dari kasus mana pun.';

@Injectable()
export class ReportsService {
  constructor(
    private readonly repository: ReportsRepository,
    private readonly flows: FlowsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Laporan milik akun ini, terbaru diperbarui di atas. */
  async list(ownerId: number): Promise<ReportSummaryView[]> {
    const rows = await this.repository.list(ownerId);
    const sections = await this.repository.sectionsOf(rows.map((row) => row.id));
    return rows.map((row) => {
      const content = sections.get(row.id) ?? [];
      const stats = reportStats(content);
      return {
        id: String(row.id),
        title: row.title,
        summary: row.summary,
        status: row.status,
        updatedAt: row.updatedAt.toISOString(),
        sourceTitle: row.sourceTitle,
        ...stats,
        blockerCount: blockersOf(reportIssues({ sections: content, snapshot: row })).length,
      };
    });
  }

  async get(id: number): Promise<ReportView> {
    const row = await this.find(id);
    const [sections, blocks, chains] = await Promise.all([
      this.repository.sectionsOf([id]).then((map) => map.get(id) ?? []),
      this.repository.snapshotBlocks(id),
      this.flows.listChains(),
    ]);
    const chainById = new Map(chains.map((chain) => [chain.id, chain]));
    const refs = new Map<string, { chain: string; txHash: string }>();
    for (const block of sections.flatMap((section) => section.blocks)) {
      const items = block.kind === 'claim' ? block.claim.evidence : block.kind === 'evidence' ? [{ chain: block.chain, txHash: block.txHash }] : [];
      for (const item of items) refs.set(`${item.chain}:${item.txHash}`, item);
    }
    const evidence = await Promise.all(
      [...refs.values()].map(async (ref) => {
        const chain = chainById.get(ref.chain)!;
        return { ...(await storedTxEvidence(this.flows, chain, ref.txHash)), explorerUrl: explorerEvidenceUrl(chain, { txHash: ref.txHash, blockNumber: null }) };
      }),
    );
    const stored = new Set(evidence.filter((item) => item.stored).map((item) => `${item.chain}:${item.txHash}`));
    const snapshot = {
      fetchedAt: row.snapshotAt.toISOString(),
      blocks: blocks.map((block) => ({ chain: block.chainId, blockNumber: block.blockNumber })),
      sources: row.sources,
      dataStatus: row.dataStatus,
      statusReason: row.statusReason,
    };
    const issues = reportIssues({ sections, snapshot }, stored);
    return {
      id: String(row.id),
      title: row.title,
      summary: row.summary,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      finalizedAt: row.finalizedAt?.toISOString() ?? null,
      source: row.sourceTitle === null ? null : { caseId: row.caseId === null ? null : String(row.caseId), title: row.sourceTitle, href: row.caseId === null ? null : `/kasus/${row.caseId}` },
      sections,
      evidence,
      snapshot,
      readiness: { ready: blockersOf(issues).length === 0, issues },
    };
  }

  /** Laporan baru; dari kasus bila `caseId` diisi (judul dan snapshot kasus disalin). */
  async create(ownerId: number, input: NewReportInput): Promise<ReportView> {
    const now = this.clock.now();
    const source = input.caseId === null ? null : await this.repository.findCase(input.caseId, ownerId);
    if (input.caseId !== null && !source) throw new NotFoundException(`Kasus ${input.caseId} tidak ditemukan.`);
    const snapshotBlocks = source?.blocks ?? [];
    const sections = await this.resolve(input.sections, snapshotBlocks);
    const id = await this.repository.db.transaction(async (tx) => {
      const row = await this.repository.insertReport(
        tx,
        {
          ownerId,
          title: input.title,
          summary: input.summary,
          caseId: source?.row.id ?? null,
          sourceTitle: source?.row.title ?? null,
          dataStatus: source?.row.dataStatus ?? 'unavailable',
          statusReason: source ? source.row.statusReason : NO_CASE_REASON,
          sources: source?.row.sources ?? [],
          snapshotAt: source?.row.snapshotAt ?? now,
          createdAt: now,
          updatedAt: now,
        },
        snapshotBlocks,
      );
      await this.repository.writeSections(tx, row.id, sections, now);
      return row.id;
    });
    return this.get(id);
  }

  async update(id: number, input: ReportUpdateInput): Promise<ReportView> {
    const row = await this.find(id);
    if (row.status === 'final') {
      const changesContent = input.title !== undefined || input.summary !== undefined || input.sections !== undefined;
      if (changesContent || input.status === undefined || input.status === 'final') {
        throw new ConflictException('Laporan final dikunci. Ubah statusnya ke review atau draft dulu sebelum mengedit.');
      }
    }
    const sections = input.sections ? await this.resolve(input.sections, await this.repository.snapshotBlocks(id)) : null;
    const now = this.clock.now();
    await this.repository.db.transaction(async (tx) => {
      if (sections) await this.repository.writeSections(tx, id, sections, now);
      const finalizing = input.status === 'final' && row.status !== 'final';
      if (finalizing) await this.assertReady(tx, row);
      await this.repository.updateReport(tx, id, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.status !== undefined ? { status: input.status, finalizedAt: input.status === 'final' ? (row.finalizedAt ?? now) : null } : {}),
        updatedAt: now,
      });
    });
    return this.get(id);
  }

  async remove(id: number): Promise<void> {
    if (!(await this.repository.remove(id))) throw new NotFoundException(`Laporan ${id} tidak ditemukan.`);
  }

  /** Laporan milik akun lain dijawab sama seperti laporan yang tidak ada. */
  async assertOwned(ownerId: number, id: number): Promise<void> {
    if (!(await this.repository.isOwnedBy(id, ownerId))) throw new NotFoundException(`Laporan ${id} tidak ditemukan.`);
  }

  private async find(id: number, executor?: Executor): Promise<ReportRow> {
    const row = await this.repository.find(id, executor);
    if (!row) throw new NotFoundException(`Laporan ${id} tidak ditemukan.`);
    return row;
  }

  /** Tolak finalisasi selama masih ada blocker; perubahan isi di permintaan yang sama ikut dibatalkan. */
  private async assertReady(executor: Executor, row: ReportRow): Promise<void> {
    const sections = (await this.repository.sectionsOf([row.id], executor)).get(row.id) ?? [];
    const blockers = blockersOf(reportIssues({ sections, snapshot: row }));
    if (blockers.length > 0) {
      const shown = blockers.slice(0, 3).map((issue) => issue.message);
      const more = blockers.length > shown.length ? ` (dan ${blockers.length - shown.length} lainnya)` : '';
      throw new ConflictException(`Laporan belum bisa difinalkan: ${shown.join(' ')}${more}`);
    }
  }

  /**
   * Pastikan chain setiap hash bukti dan rujukan chain lain dikenal. Hash klaim
   * tanpa chain memakai satu-satunya chain di snapshot laporan; bila tidak ada
   * atau lebih dari satu, chain wajib disebut.
   */
  private async resolve(sections: SectionInput[], snapshotBlocks: Array<{ chainId: string }>): Promise<ResolvedSection[]> {
    const known = new Set((await this.flows.listChains()).map((chain) => chain.id));
    const onlyChain = snapshotBlocks.length === 1 ? snapshotBlocks[0].chainId : null;
    const check = (chain: string | null) => {
      if (chain !== null && !known.has(chain)) throw new BadRequestException(`Chain "${chain}" tidak dikenal.`);
    };
    return sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => {
        if (block.kind === 'evidence') check(block.chain);
        if (block.kind === 'entity') check(block.subject.chain);
        if (block.kind !== 'claim') return block;
        const evidence = block.claim.evidence.map((ref) => {
          const chain = ref.chain ?? onlyChain;
          if (chain === null) throw new BadRequestException(`Hash bukti klaim "${block.claim.title}" wajib menyebut chain-nya.`);
          check(chain);
          return { chain, txHash: ref.txHash };
        });
        const unique = [...new Map(evidence.map((ref) => [`${ref.chain}:${ref.txHash}`, ref])).values()];
        return { ...block, claim: { ...block.claim, evidence: unique } };
      }),
    }));
  }
}
