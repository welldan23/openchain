/**
 * Riwayat investigasi: halaman yang pernah dibuka. Membuka ulang halaman yang
 * sama memperbarui baris yang sama (waktu, judul, jumlah temuan, hitungan).
 * Menghapus riwayat tidak menyentuh data on-chain; halamannya tetap bisa
 * dibuka lagi.
 */
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { count, desc, eq, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../database/database.module.js';
import type { InvestigationKind } from '../database/schema/enums.js';
import { chains, investigations } from '../database/schema/index.js';
import type { InvestigationEntryView, InvestigationListResponse, NewInvestigationInput } from './investigations.types.js';

type Row = typeof investigations.$inferSelect;

export const DEFAULT_HISTORY_LIMIT = 50;
export const MAX_HISTORY_LIMIT = 200;

export function toEntryView(row: Row): InvestigationEntryView {
  return {
    id: String(row.id),
    kind: row.kind,
    title: row.title,
    chain: row.chainId,
    href: row.href,
    openedAt: row.openedAt.toISOString(),
    firstOpenedAt: row.firstOpenedAt.toISOString(),
    openCount: row.openCount,
    note: row.note,
    findingCount: row.findingCount,
  };
}

@Injectable()
export class InvestigationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(kind?: InvestigationKind, limit = DEFAULT_HISTORY_LIMIT): Promise<InvestigationListResponse> {
    const where = kind ? eq(investigations.kind, kind) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db.select().from(investigations).where(where).orderBy(desc(investigations.openedAt), desc(investigations.id)).limit(limit),
      this.db.select({ total: count() }).from(investigations).where(where),
    ]);
    return { entries: rows.map(toEntryView), total, limit };
  }

  /** Catat halaman yang dibuka; waktu dan id dari server. */
  async record(input: NewInvestigationInput): Promise<{ entry: InvestigationEntryView; created: boolean }> {
    if (input.chain !== null) {
      const [chain] = await this.db.select({ id: chains.id }).from(chains).where(eq(chains.id, input.chain)).limit(1);
      if (!chain) throw new BadRequestException(`Chain "${input.chain}" tidak dikenal.`);
    }
    const now = this.clock.now();
    const [row] = await this.db
      .insert(investigations)
      .values({
        kind: input.kind,
        title: input.title,
        chainId: input.chain,
        href: input.href,
        note: input.note,
        findingCount: input.findingCount,
        firstOpenedAt: now,
        openedAt: now,
      })
      .onConflictDoUpdate({
        target: investigations.href,
        set: {
          title: input.title,
          chainId: input.chain,
          openedAt: now,
          openCount: sql`${investigations.openCount} + 1`,
          // Jumlah temuan baru hanya menimpa bila dikirim; catatan lama tidak dihapus saat dibuka ulang.
          findingCount: input.findingCount === null ? sql`${investigations.findingCount}` : input.findingCount,
          note: input.note === null ? sql`${investigations.note}` : input.note,
        },
      })
      .returning();
    return { entry: toEntryView(row), created: row.openCount === 1 };
  }

  async remove(id: number): Promise<void> {
    const deleted = await this.db.delete(investigations).where(eq(investigations.id, id)).returning({ id: investigations.id });
    if (deleted.length === 0) throw new NotFoundException('Investigasi ini sudah tidak ada di riwayat.');
  }
}
