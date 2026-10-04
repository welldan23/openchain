/**
 * Menyimpan jenis tiap perpindahan dana ke `movement_classifications`.
 *
 * Dihitung dari address dan label yang tersimpan saat itu, jadi bisa diulang
 * kapan saja (mis. setelah label baru masuk) tanpa menyentuh transfernya.
 * Hasil lama untuk transfer yang sama diganti.
 */
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { numericToNumber } from '../common/units.js';
import type { Database } from '../database/database.module.js';
import { addresses, labels, movementClassifications, nativeTransfers, tokenTransfers } from '../database/schema/index.js';
import { classifyMovement, type MovementParty, type PartyLabel } from './movement-classifier.js';

const CHUNK = 500;

export interface ClassificationTargets {
  nativeIds: number[];
  tokenIds: number[];
}

export class MovementClassificationService {
  constructor(private readonly db: Database) {}

  /** Klasifikasikan transfer tertentu; mengembalikan jumlah yang disimpan. */
  async classify(targets: ClassificationTargets, classifiedAt: Date): Promise<number> {
    const natives = targets.nativeIds.length
      ? await this.db
          .select({ id: nativeTransfers.id, fromId: nativeTransfers.fromAddressId, toId: nativeTransfers.toAddressId })
          .from(nativeTransfers)
          .where(inArray(nativeTransfers.id, targets.nativeIds))
      : [];
    const tokens = targets.tokenIds.length
      ? await this.db
          .select({ id: tokenTransfers.id, fromId: tokenTransfers.fromAddressId, toId: tokenTransfers.toAddressId })
          .from(tokenTransfers)
          .where(inArray(tokenTransfers.id, targets.tokenIds))
      : [];
    const partyIds = [...new Set([...natives, ...tokens].flatMap((row) => [row.fromId, row.toId]))];
    if (partyIds.length === 0) return 0;
    const parties = await this.loadParties(partyIds);
    const party = (id: number): MovementParty => parties.get(id) ?? { address: '', labels: [] };

    const rows = [
      ...natives.map((row) => ({ nativeTransferId: row.id, tokenTransferId: null, ...classifyMovement(party(row.fromId), party(row.toId)) })),
      ...tokens.map((row) => ({ nativeTransferId: null, tokenTransferId: row.id, ...classifyMovement(party(row.fromId), party(row.toId)) })),
    ].map(({ confidence, ...row }) => ({ ...row, confidence: confidence === null ? null : confidence.toFixed(3), classifiedAt }));

    for (let start = 0; start < rows.length; start += CHUNK) {
      const chunk = rows.slice(start, start + CHUNK);
      const set = {
        movementType: sql`excluded.movement_type`,
        classification: sql`excluded.classification`,
        basis: sql`excluded.basis`,
        labelId: sql`excluded.label_id`,
        confidence: sql`excluded.confidence`,
        classifiedAt: sql`excluded.classified_at`,
      };
      const nativeChunk = chunk.filter((row) => row.nativeTransferId !== null);
      const tokenChunk = chunk.filter((row) => row.tokenTransferId !== null);
      if (nativeChunk.length > 0) {
        await this.db.insert(movementClassifications).values(nativeChunk).onConflictDoUpdate({ target: movementClassifications.nativeTransferId, set });
      }
      if (tokenChunk.length > 0) {
        await this.db.insert(movementClassifications).values(tokenChunk).onConflictDoUpdate({ target: movementClassifications.tokenTransferId, set });
      }
    }
    return rows.length;
  }

  /** Ulangi klasifikasi semua transfer yang melibatkan address, mis. setelah labelnya berubah. */
  async reclassifyAddress(chainId: string, addressId: number, classifiedAt: Date): Promise<number> {
    const involves = (table: typeof nativeTransfers | typeof tokenTransfers) =>
      and(eq(table.chainId, chainId), or(eq(table.fromAddressId, addressId), eq(table.toAddressId, addressId)));
    const nativeIds = (await this.db.select({ id: nativeTransfers.id }).from(nativeTransfers).where(involves(nativeTransfers))).map((row) => row.id);
    const tokenIds = (await this.db.select({ id: tokenTransfers.id }).from(tokenTransfers).where(involves(tokenTransfers))).map((row) => row.id);
    return this.classify({ nativeIds, tokenIds }, classifiedAt);
  }

  private async loadParties(ids: number[]): Promise<Map<number, MovementParty>> {
    const parties = new Map<number, MovementParty>();
    for (let start = 0; start < ids.length; start += CHUNK) {
      const chunk = ids.slice(start, start + CHUNK);
      const rows = await this.db.select({ id: addresses.id, address: addresses.address }).from(addresses).where(inArray(addresses.id, chunk));
      for (const row of rows) parties.set(row.id, { address: row.address, labels: [] });
      const labelRows = await this.db.select().from(labels).where(inArray(labels.addressId, chunk));
      for (const label of labelRows) {
        const party = parties.get(label.addressId);
        if (!party) continue;
        const entry: PartyLabel = {
          id: label.id,
          type: label.labelType,
          name: label.name,
          source: label.source,
          sourceName: label.sourceName,
          confidence: numericToNumber(label.confidence),
        };
        parties.set(label.addressId, { ...party, labels: [...party.labels, entry] });
      }
    }
    return parties;
  }
}
