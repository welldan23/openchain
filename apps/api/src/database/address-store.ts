/**
 * Penyimpanan bersama untuk proses ingest: run provider dan address.
 * Dipakai ingest token dan ingest aliran dana supaya aturannya sama.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { ProviderRunRecord } from '../providers/provider.types.js';
import type { Database } from './database.module.js';
import { normalizeAddress } from './identifiers.js';
import type { ChainFamily } from './schema/enums.js';
import { addresses, providerRuns } from './schema/index.js';

export interface StoredRun {
  id: number;
  provider: string;
  kind: string;
  operation: string;
  status: ProviderRunRecord['status'];
  errorReason: string | null;
  missingFields: string[];
}

/** Simpan semua run provider, termasuk yang gagal, dengan urutan yang sama. */
export async function insertProviderRuns(db: Database, chainId: string, runs: readonly ProviderRunRecord[]): Promise<StoredRun[]> {
  if (runs.length === 0) return [];
  const rows = await db
    .insert(providerRuns)
    .values(
      runs.map((run) => ({
        provider: run.provider,
        kind: run.kind,
        chainId,
        operation: run.operation,
        subject: run.subject,
        status: run.status,
        errorReason: run.errorReason,
        blockFrom: run.blockFrom,
        blockTo: run.blockTo,
        missingFields: run.missingFields,
        startedAt: run.startedAt,
        fetchedAt: run.fetchedAt,
      })),
    )
    .returning();
  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    kind: row.kind,
    operation: row.operation,
    status: row.status,
    errorReason: row.errorReason,
    missingFields: row.missingFields,
  }));
}

const CHUNK = 500;

/**
 * Simpan address tanpa duplikat dan kembalikan id per bentuk ternormalisasi.
 * Identifier asli yang sudah tersimpan tidak diubah; status kontrak hanya
 * diisi bila sebelumnya belum diketahui.
 */
export async function upsertAddresses(
  db: Database,
  chainId: string,
  family: ChainFamily,
  entries: ReadonlyArray<{ address: string; isContract: boolean | null }>,
): Promise<Map<string, number>> {
  const unique = new Map<string, { address: string; isContract: boolean | null }>();
  for (const entry of entries) {
    const normalized = normalizeAddress(family, entry.address);
    const existing = unique.get(normalized);
    unique.set(normalized, {
      address: existing?.address ?? entry.address.trim(),
      isContract: existing?.isContract ?? entry.isContract,
    });
  }
  const values = [...unique].map(([addressNormalized, entry]) => ({
    chainId,
    address: entry.address,
    addressNormalized,
    isContract: entry.isContract,
  }));
  const ids = new Map<string, number>();
  for (let start = 0; start < values.length; start += CHUNK) {
    const chunk = values.slice(start, start + CHUNK);
    await db
      .insert(addresses)
      .values(chunk)
      .onConflictDoUpdate({
        target: [addresses.chainId, addresses.addressNormalized],
        set: { isContract: sql`coalesce(${addresses.isContract}, excluded.is_contract)` },
      });
    const rows = await db
      .select({ id: addresses.id, normalized: addresses.addressNormalized })
      .from(addresses)
      .where(and(eq(addresses.chainId, chainId), inArray(addresses.addressNormalized, chunk.map((value) => value.addressNormalized))));
    for (const row of rows) ids.set(row.normalized, row.id);
  }
  return ids;
}
