/**
 * Kasus investigasi: menyimpan subjek, temuan beserta hash buktinya, langkah,
 * dan catatan, lalu membekukan snapshot data (blok, provider, kelengkapan)
 * yang dipakai saat item ditambahkan. Bukti transaksi dibaca dari data
 * tersimpan; hash yang belum tercatat ditandai `stored: false`, tidak dikarang.
 * Yang sudah ada di kasus tidak digandakan.
 */
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, max } from 'drizzle-orm';
import { EVM_CHAIN_DEFINITIONS, PHASE_4_CHAINS } from '../chains/chain-definitions.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { formatUnits, numericToNumber } from '../common/units.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { InvalidIdentifierError, normalizeAddress, normalizeTxHash } from '../database/identifiers.js';
import type { CaseSubjectKind } from '../database/schema/enums.js';
import { caseFindingEvidence, caseFindings, caseNotes, cases, caseSnapshotBlocks, caseSteps, caseSubjects } from '../database/schema/index.js';
import { nativeAssetOf } from '../flows/flow-summary.mapper.js';
import type { FlowAsset } from '../flows/flow-summary.types.js';
import { FlowsRepository } from '../flows/flows.repository.js';
import { sortLabels, toLabelView } from '../tokens/holders.mapper.js';
import type { CaseItemsInput, CaseUpdateInput, FindingInput, NewCaseInput, StepInput } from './case-input.js';
import { caseSnapshot, type CaseSnapshot, type SubjectSnapshotInput } from './case-snapshot.js';
import { CasesRepository } from './cases.repository.js';
import type { CaseEvidenceView, CaseSummaryView, CaseView, SaveToCaseResult } from './cases.types.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type CaseRow = typeof cases.$inferSelect;
type ChainRow = Awaited<ReturnType<FlowsRepository['listChains']>>[number];

const CHAIN_ORDER = [...EVM_CHAIN_DEFINITIONS.map((definition) => definition.id), ...PHASE_4_CHAINS];
const chainRank = (chainId: string) => (CHAIN_ORDER.includes(chainId) ? CHAIN_ORDER.indexOf(chainId) : CHAIN_ORDER.length);

/** Subjek kasus yang dipakai untuk snapshot dan pencegahan duplikat. */
interface SubjectKey {
  kind: CaseSubjectKind;
  chainId: string | null;
  addressNormalized: string;
  title: string;
}

/** Isi permintaan yang sudah diperiksa terhadap chain dan isi kasus, siap ditulis. */
interface PreparedItems {
  subject: (SubjectKey & { address: string; addressId: number | null; href: string; isNew: boolean }) | null;
  findings: Array<Omit<FindingInput, 'chain'> & { chainId: string }>;
  note: string | null;
  step: StepInput | null;
  snapshot: CaseSnapshot;
}

@Injectable()
export class CasesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: CasesRepository,
    private readonly flows: FlowsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Semua kasus, terbaru diperbarui di atas. */
  async list(): Promise<CaseSummaryView[]> {
    const [rows, counts] = await Promise.all([this.db.select().from(cases).orderBy(desc(cases.updatedAt), desc(cases.id)), this.repository.counts()]);
    return rows.map((row) => {
      const count = counts.get(row.id);
      return {
        id: String(row.id),
        title: row.title,
        summary: row.summary,
        status: row.status,
        updatedAt: row.updatedAt.toISOString(),
        tags: row.tags,
        chains: [...(count?.chains ?? [])].sort((a, b) => chainRank(a) - chainRank(b) || a.localeCompare(b)),
        subjectCount: count?.subjectCount ?? 0,
        findingCount: count?.findingCount ?? 0,
        evidenceCount: count?.evidenceCount ?? 0,
        noteCount: count?.noteCount ?? 0,
        dataStatus: row.dataStatus,
      };
    });
  }

  async get(id: number): Promise<CaseView> {
    const row = await this.find(id);
    const [subjects, findings, evidenceRows, notes, steps, blocks, chains] = await Promise.all([
      this.db.select().from(caseSubjects).where(eq(caseSubjects.caseId, id)).orderBy(asc(caseSubjects.addedAt), asc(caseSubjects.id)),
      this.db.select().from(caseFindings).where(eq(caseFindings.caseId, id)).orderBy(asc(caseFindings.position), asc(caseFindings.id)),
      this.db
        .select({ findingId: caseFindingEvidence.findingId, chainId: caseFindingEvidence.chainId, txHash: caseFindingEvidence.txHash })
        .from(caseFindingEvidence)
        .innerJoin(caseFindings, eq(caseFindings.id, caseFindingEvidence.findingId))
        .where(eq(caseFindings.caseId, id))
        .orderBy(asc(caseFindingEvidence.id)),
      this.db.select().from(caseNotes).where(eq(caseNotes.caseId, id)).orderBy(desc(caseNotes.createdAt), desc(caseNotes.id)),
      this.db.select().from(caseSteps).where(eq(caseSteps.caseId, id)).orderBy(desc(caseSteps.openedAt), desc(caseSteps.id)),
      this.db.select().from(caseSnapshotBlocks).where(eq(caseSnapshotBlocks.caseId, id)),
      this.flows.listChains(),
    ]);

    // Label subjek: address di chain-nya, atau di chain EVM mana pun untuk subjek multichain.
    const evmIds = chains.filter((chain) => chain.family === 'evm').map((chain) => chain.id);
    const candidates = await Promise.all(
      subjects.map(async (subject) => {
        if (subject.addressId !== null) return [subject.addressId];
        if (subject.chainId !== null) return [];
        return (await this.repository.addressIds(evmIds, subject.addressNormalized)).map((address) => address.id);
      }),
    );
    const labelsById = await this.flows.labelsByAddressIds([...new Set(candidates.flat())]);

    const unique = new Map<string, { chainId: string; txHash: string }>();
    for (const item of evidenceRows) unique.set(`${item.chainId}:${item.txHash}`, item);
    const chainById = new Map(chains.map((chain) => [chain.id, chain]));
    const evidence = await Promise.all([...unique.values()].map((item) => this.evidence(chainById.get(item.chainId)!, item.txHash)));

    return {
      id: String(row.id),
      title: row.title,
      summary: row.summary,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      tags: row.tags,
      subjects: subjects.map((subject, index) => {
        const labels = sortLabels(candidates[index].flatMap((addressId) => labelsById.get(addressId) ?? []));
        return {
          id: String(subject.id),
          kind: subject.kind,
          chain: subject.chainId,
          address: subject.address,
          title: subject.title,
          label: labels.length > 0 ? toLabelView(labels[0]) : null,
          href: subject.href,
        };
      }),
      findings: findings.map((finding) => ({
        id: finding.key,
        title: finding.title,
        detail: finding.detail,
        classification: finding.classification,
        evidence: evidenceRows.filter((item) => item.findingId === finding.id).map((item) => ({ chain: item.chainId, txHash: item.txHash })),
      })),
      evidence,
      steps: steps.map((step) => ({ kind: step.kind, title: step.title, chain: step.chainId, href: step.href, openedAt: step.openedAt.toISOString() })),
      notes: notes.map((note) => ({ id: String(note.id), body: note.body, createdAt: note.createdAt.toISOString() })),
      snapshot: {
        fetchedAt: row.snapshotAt.toISOString(),
        blocks: blocks
          .map((block) => ({ chain: block.chainId, blockNumber: block.blockNumber }))
          .sort((a, b) => chainRank(a.chain) - chainRank(b.chain) || a.chain.localeCompare(b.chain)),
        sources: row.sources,
        dataStatus: row.dataStatus,
        statusReason: row.statusReason,
      },
    };
  }

  /** Kasus baru, sekaligus dengan item pertamanya bila dikirim. */
  async create(input: NewCaseInput): Promise<SaveToCaseResult> {
    const prepared = await this.prepare(input, []);
    const now = this.clock.now();
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(cases)
        .values({ title: input.title, summary: input.summary, tags: input.tags, ...snapshotColumns(prepared.snapshot), createdAt: now, updatedAt: now })
        .returning();
      const result = await this.write(tx, row, prepared, now);
      return { ...result, created: true };
    });
  }

  /** Tambah item ke kasus yang ada; subjek, temuan, dan langkah yang sudah ada tidak digandakan. */
  async addItems(id: number, input: CaseItemsInput): Promise<SaveToCaseResult> {
    const row = await this.find(id);
    const existing = await this.db.select().from(caseSubjects).where(eq(caseSubjects.caseId, id));
    const prepared = await this.prepare(input, existing);
    const now = this.clock.now();
    return this.db.transaction(async (tx) => {
      await tx
        .update(cases)
        .set({ ...snapshotColumns(prepared.snapshot), updatedAt: now })
        .where(eq(cases.id, id));
      return { ...(await this.write(tx, row, prepared, now)), created: false };
    });
  }

  async update(id: number, input: CaseUpdateInput): Promise<CaseView> {
    await this.find(id);
    await this.db
      .update(cases)
      .set({ ...input, updatedAt: this.clock.now() })
      .where(eq(cases.id, id));
    return this.get(id);
  }

  async remove(id: number): Promise<void> {
    const deleted = await this.db.delete(cases).where(eq(cases.id, id)).returning({ id: cases.id });
    if (deleted.length === 0) throw new NotFoundException('Kasus ini sudah tidak ada.');
  }

  /** Hapus subjek, lalu bekukan ulang snapshot dari subjek yang tersisa. */
  async removeSubject(id: number, subjectId: number): Promise<void> {
    await this.find(id);
    const remaining = (await this.db.select().from(caseSubjects).where(eq(caseSubjects.caseId, id))).filter((subject) => subject.id !== subjectId);
    const snapshot = await this.snapshotOf(remaining);
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(caseSubjects)
        .where(and(eq(caseSubjects.caseId, id), eq(caseSubjects.id, subjectId)))
        .returning({ id: caseSubjects.id });
      if (deleted.length === 0) throw new NotFoundException('Subjek ini sudah tidak ada di kasus.');
      await tx
        .update(cases)
        .set({ ...snapshotColumns(snapshot), updatedAt: now })
        .where(eq(cases.id, id));
      await writeBlocks(tx, id, snapshot);
    });
  }

  async removeFinding(id: number, key: string): Promise<void> {
    await this.find(id);
    const deleted = await this.db
      .delete(caseFindings)
      .where(and(eq(caseFindings.caseId, id), eq(caseFindings.key, key)))
      .returning({ id: caseFindings.id });
    if (deleted.length === 0) throw new NotFoundException('Temuan ini sudah tidak ada di kasus.');
    await this.touch(id);
  }

  async removeNote(id: number, noteId: number): Promise<void> {
    await this.find(id);
    const deleted = await this.db
      .delete(caseNotes)
      .where(and(eq(caseNotes.caseId, id), eq(caseNotes.id, noteId)))
      .returning({ id: caseNotes.id });
    if (deleted.length === 0) throw new NotFoundException('Catatan ini sudah tidak ada di kasus.');
    await this.touch(id);
  }

  private async find(id: number): Promise<CaseRow> {
    const [row] = await this.db.select().from(cases).where(eq(cases.id, id)).limit(1);
    if (!row) throw new NotFoundException('Kasus tidak ditemukan. Mungkin sudah dihapus.');
    return row;
  }

  private async touch(id: number): Promise<void> {
    await this.db.update(cases).set({ updatedAt: this.clock.now() }).where(eq(cases.id, id));
  }

  /** Periksa chain, address, dan hash; tentukan yang baru; hitung snapshot. Semua dibaca sebelum menulis. */
  private async prepare(input: CaseItemsInput, existing: readonly SubjectKey[]): Promise<PreparedItems> {
    const chains = await this.flows.listChains();
    const chainById = new Map(chains.map((chain) => [chain.id, chain]));
    const known = (chainId: string | null): ChainRow | null => {
      if (chainId === null) return null;
      const chain = chainById.get(chainId);
      if (!chain) throw new BadRequestException(`Chain "${chainId}" tidak dikenal.`);
      return chain;
    };

    let subject: PreparedItems['subject'] = null;
    if (input.subject) {
      const chain = known(input.subject.chain);
      const addressNormalized = identifier(() => normalizeAddress(chain?.family ?? 'evm', input.subject!.address), 'Address subjek tidak valid untuk chain ini.');
      const isNew = !existing.some((item) => item.kind === input.subject!.kind && item.chainId === (chain?.id ?? null) && item.addressNormalized === addressNormalized);
      const address = chain ? await this.flows.findAddress(chain.id, addressNormalized) : null;
      subject = {
        kind: input.subject.kind,
        chainId: chain?.id ?? null,
        address: input.subject.address,
        addressNormalized,
        addressId: address?.id ?? null,
        title: input.subject.title,
        href: input.subject.href,
        isNew,
      };
    }

    const findings = input.findings.map((finding) => {
      const chain = known(finding.chain ?? subject?.chainId ?? null);
      if (!chain) throw new BadRequestException(`Temuan "${finding.title}" butuh chain untuk hash buktinya.`);
      const evidenceTxHashes = [...new Set(finding.evidenceTxHashes.map((hash) => identifier(() => normalizeTxHash(chain.family, hash), `Hash bukti ${hash} tidak valid untuk ${chain.name}.`)))];
      return { key: finding.key, title: finding.title, detail: finding.detail, classification: finding.classification, chainId: chain.id, evidenceTxHashes };
    });
    known(input.step?.chain ?? null);

    const subjects = subject?.isNew ? [...existing, subject] : existing;
    return { subject, findings, note: input.note, step: input.step, snapshot: await this.snapshotOf(subjects) };
  }

  private async snapshotOf(subjects: readonly SubjectKey[]): Promise<CaseSnapshot> {
    const chains = await this.flows.listChains();
    const evmIds = chains.filter((chain) => chain.family === 'evm').map((chain) => chain.id);
    const inputs: SubjectSnapshotInput[] = await Promise.all(
      subjects.map(async (subject) => {
        if (subject.kind === 'token') {
          const source = subject.chainId ? await this.repository.tokenSource(subject.chainId, subject.addressNormalized) : null;
          return { title: subject.title, sources: source ? [source] : [] };
        }
        return { title: subject.title, sources: await this.repository.scanSources(subject.chainId ? [subject.chainId] : evmIds, subject.addressNormalized) };
      }),
    );
    return caseSnapshot(inputs, this.clock.now(), chainRank);
  }

  private async write(tx: Tx, row: CaseRow, prepared: PreparedItems, now: Date): Promise<Omit<SaveToCaseResult, 'created'>> {
    const { subject } = prepared;
    if (subject?.isNew) {
      await tx.insert(caseSubjects).values({
        caseId: row.id,
        kind: subject.kind,
        chainId: subject.chainId,
        address: subject.address,
        addressNormalized: subject.addressNormalized,
        addressId: subject.addressId,
        title: subject.title,
        href: subject.href,
        addedAt: now,
      });
    }

    const keys = new Set((await tx.select({ key: caseFindings.key }).from(caseFindings).where(eq(caseFindings.caseId, row.id))).map((item) => item.key));
    const [{ last }] = await tx
      .select({ last: max(caseFindings.position) })
      .from(caseFindings)
      .where(eq(caseFindings.caseId, row.id));
    let position = (last ?? -1) + 1;
    let added = 0;
    for (const finding of prepared.findings) {
      if (keys.has(finding.key)) continue;
      keys.add(finding.key);
      const [inserted] = await tx
        .insert(caseFindings)
        .values({ caseId: row.id, key: finding.key, title: finding.title, detail: finding.detail, classification: finding.classification, position: position++, addedAt: now })
        .returning({ id: caseFindings.id });
      await tx.insert(caseFindingEvidence).values(finding.evidenceTxHashes.map((txHash) => ({ findingId: inserted.id, chainId: finding.chainId, txHash })));
      added += 1;
    }

    if (prepared.note !== null) await tx.insert(caseNotes).values({ caseId: row.id, body: prepared.note, createdAt: now });

    let stepAdded = false;
    if (prepared.step) {
      const step = prepared.step;
      const [found] = await tx
        .select({ id: caseSteps.id })
        .from(caseSteps)
        .where(and(eq(caseSteps.caseId, row.id), eq(caseSteps.href, step.href)))
        .limit(1);
      if (found) {
        await tx.update(caseSteps).set({ title: step.title, chainId: step.chain, openedAt: now }).where(eq(caseSteps.id, found.id));
      } else {
        await tx.insert(caseSteps).values({ caseId: row.id, kind: step.kind, title: step.title, chainId: step.chain, href: step.href, openedAt: now });
        stepAdded = true;
      }
    }

    await writeBlocks(tx, row.id, prepared.snapshot);
    return {
      caseId: String(row.id),
      caseTitle: row.title,
      subjectAdded: subject?.isNew ?? false,
      addedFindings: added,
      skippedFindings: prepared.findings.length - added,
      noteAdded: prepared.note !== null,
      stepAdded,
    };
  }

  /** Bukti satu hash dari data tersimpan; kosong dan `stored: false` bila belum tercatat. */
  private async evidence(chain: ChainRow, txHash: string): Promise<CaseEvidenceView> {
    const movements = await this.flows.movementsByTx(chain.id, txHash);
    const transaction = movements.length === 0 ? await this.flows.findTransaction(chain.id, txHash) : null;
    if (movements.length === 0 && !transaction) return { chain: chain.id, txHash, stored: false, timestamp: null, blockNumber: null, movements: [] };

    const [addressById, tokensById] = await Promise.all([
      this.flows.addressesByIds([...new Set(movements.flatMap((move) => [move.fromId, move.toId]))]),
      this.flows.tokensByIds([...new Set(movements.flatMap((move) => (move.tokenId === null ? [] : [move.tokenId])))]),
    ]);
    const native = nativeAssetOf(chain);
    const first = movements[0];
    return {
      chain: chain.id,
      txHash,
      stored: true,
      timestamp: (first?.timestamp ?? transaction!.transaction.blockTimestamp).toISOString(),
      blockNumber: first?.blockNumber ?? transaction!.transaction.blockNumber,
      movements: movements.map((move) => {
        const token = move.tokenId === null ? null : tokensById.get(move.tokenId);
        const asset: FlowAsset = token ? { type: 'token', address: token.address, symbol: token.symbol, name: token.name, decimals: token.decimals } : native;
        return {
          from: addressById.get(move.fromId) ?? '',
          to: addressById.get(move.toId) ?? '',
          asset,
          amountRaw: move.amountRaw,
          amount: asset.decimals === null ? null : formatUnits(move.amountRaw, asset.decimals),
          amountUsd: numericToNumber(move.amountUsd),
        };
      }),
    };
  }
}

function identifier(normalize: () => string, message: string): string {
  try {
    return normalize();
  } catch (error) {
    if (error instanceof InvalidIdentifierError) throw new BadRequestException(message);
    throw error;
  }
}

function snapshotColumns(snapshot: CaseSnapshot) {
  return { dataStatus: snapshot.dataStatus, statusReason: snapshot.statusReason, sources: snapshot.sources, snapshotAt: snapshot.snapshotAt };
}

async function writeBlocks(tx: Tx, caseId: number, snapshot: CaseSnapshot): Promise<void> {
  await tx.delete(caseSnapshotBlocks).where(eq(caseSnapshotBlocks.caseId, caseId));
  if (snapshot.blocks.length > 0) {
    await tx.insert(caseSnapshotBlocks).values(snapshot.blocks.map((block) => ({ caseId, chainId: block.chainId, blockNumber: block.blockNumber })));
  }
}
