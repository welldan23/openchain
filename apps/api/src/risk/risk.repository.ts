/**
 * Query untuk skoring risiko: fakta tersimpan per objek (cek kontrak,
 * snapshot token, peta, pemindaian aliran dana, klasifikasi perpindahan,
 * bridge, label) dan penyimpanan hasil penilaian. Tidak menghubungi provider.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import type { ChainFamily, CheckStatus, ClusterLabel, ConfidenceLevel, DataStatus, InfoClassification, RiskObjectKind } from '../database/schema/enums.js';
import {
  riskAssessments,
  riskAssessmentSources,
  riskReasonEvidence,
  riskReasons,
  riskTraitChecks,
  riskWarningEvidence,
  riskWarnings,
} from '../database/schema/index.js';
import type { AssessmentDraft, CheckFact, ClusterFact, EvidenceRef, MovementFact } from './risk-rules.js';

type Raw = Record<string, unknown>;

/** Label yang menandai address sebagai kontrak infrastruktur, bukan wallet biasa. */
const CONTRACT_LABELS = ['liquidity_pool', 'router', 'bridge', 'infrastructure', 'launchpad', 'faucet'];

const inList = (values: readonly (string | number)[]) =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );

export interface RiskObjectRow {
  chainId: string;
  addressId: number;
  address: string;
  tokenId: number | null;
  isContract: boolean | null;
  hasContractLabel: boolean;
}

export interface DataPoint {
  blockNumber: number;
  fetchedAt: Date;
  dataStatus: DataStatus;
  statusReason: string | null;
  providerRunIds: number[];
}

export interface PersistInput {
  chainId: string;
  addressId: number;
  objectKind: RiskObjectKind;
  tokenSnapshotId: number | null;
  methodology: string;
  draft: AssessmentDraft;
  data: DataPoint;
  dataStatus: DataStatus;
  statusReason: string | null;
  assessedAt: Date;
}

@Injectable()
export class RiskRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async chains(): Promise<Array<{ id: string; family: ChainFamily; name: string }>> {
    const rows = await this.rows(sql`select id, family, name from chains order by id`);
    return rows.map((row) => ({ id: String(row.id), family: row.family as ChainFamily, name: String(row.name) }));
  }

  /** Address tersimpan dengan bentuk ternormalisasi ini di chain-chain tersebut, beserta petunjuk jenis objeknya. */
  async objects(chainIds: readonly string[], addressNormalized: string): Promise<RiskObjectRow[]> {
    if (chainIds.length === 0) return [];
    const rows = await this.rows(sql`
      select a.id, a.chain_id, a.address, a.is_contract, t.id as token_id,
        exists (select 1 from labels l where l.address_id = a.id and l.label_type::text in (${inList(CONTRACT_LABELS)})) as has_contract_label
      from addresses a
      left join tokens t on t.address_id = a.id
      where a.address_normalized = ${addressNormalized} and a.chain_id in (${inList(chainIds)})
      order by a.chain_id`);
    return rows.map((row) => ({
      chainId: String(row.chain_id),
      addressId: Number(row.id),
      address: String(row.address),
      tokenId: row.token_id === null ? null : Number(row.token_id),
      isContract: row.is_contract === null ? null : Boolean(row.is_contract),
      hasContractLabel: Boolean(row.has_contract_label),
    }));
  }

  /* --------------------------------- Token -------------------------------- */

  /** Snapshot token terbaru beserta provider dan alasan provider yang gagal. */
  async latestTokenSnapshot(tokenId: number): Promise<(DataPoint & { snapshotId: number; top10Pct: number | null }) | null> {
    const [row] = await this.rows(sql`
      select s.id, s.block_number, s.fetched_at, s.data_status, s.top10_pct::float8 as top10_pct,
        coalesce(array(select ss.provider_run_id from token_snapshot_sources ss where ss.snapshot_id = s.id order by 1), '{}') as runs,
        (select string_agg(distinct r.provider || ': ' || coalesce(r.error_reason, 'data belum lengkap (' || array_to_string(r.missing_fields, ', ') || ')'), '; ')
          from token_snapshot_sources ss join provider_runs r on r.id = ss.provider_run_id
          where ss.snapshot_id = s.id and (r.error_reason is not null or cardinality(r.missing_fields) > 0)) as reason
      from token_snapshots s where s.token_id = ${tokenId}
      order by s.block_number desc, s.id desc limit 1`);
    if (!row) return null;
    return {
      snapshotId: Number(row.id),
      blockNumber: Number(row.block_number),
      fetchedAt: new Date(row.fetched_at as string | Date),
      dataStatus: row.data_status as DataStatus,
      statusReason: row.reason === null ? null : String(row.reason),
      providerRunIds: ((row.runs as Array<string | number>) ?? []).map(Number),
      top10Pct: row.top10_pct === null ? null : Number(row.top10_pct),
    };
  }

  async contractChecks(snapshotId: number): Promise<CheckFact[]> {
    const rows = await this.rows(sql`
      select c.id, c.code, c.status, c.value, c.classification, e.id as evidence_id, e.chain_id, e.tx_hash
      from contract_checks c
      left join contract_check_evidence ce on ce.check_id = c.id
      left join evidence e on e.id = ce.evidence_id and e.tx_hash is not null
      where c.snapshot_id = ${snapshotId}
      order by c.id, e.id`);
    const checks = new Map<number, CheckFact>();
    for (const row of rows) {
      const id = Number(row.id);
      let check = checks.get(id);
      if (!check) {
        check = {
          code: String(row.code),
          status: row.status as CheckStatus,
          value: String(row.value),
          classification: row.classification === null ? null : (row.classification as InfoClassification),
          evidence: [],
        };
        checks.set(id, check);
      }
      if (row.tx_hash !== null && row.tx_hash !== undefined) check.evidence.push(evidenceRef(row));
    }
    return [...checks.values()];
  }

  /** Kelompok di peta terbaru token yang sudah dikelompokkan; `null` bila belum ada peta seperti itu. */
  async tokenClusters(tokenId: number): Promise<ClusterFact[] | null> {
    const [map] = await this.rows(sql`
      select m.id from wallet_maps m where m.token_id = ${tokenId} and m.clustered_at is not null
      order by m.block_number desc, m.id desc limit 1`);
    if (!map) return null;
    return this.clusters(sql`c.map_id = ${Number(map.id)}`);
  }

  /* --------------------------------- Wallet ------------------------------- */

  /** Pemindaian aliran dana terbaru yang terbaca untuk address ini di chain ini. */
  async latestFlowScan(chainId: string, addressId: number): Promise<DataPoint | null> {
    const [row] = await this.rows(sql`
      select f.block_to, f.scanned_at, f.status, f.status_reason, f.provider_run_id
      from address_flow_scans f
      where f.chain_id = ${chainId} and f.address_id = ${addressId} and f.status <> 'unavailable'
      order by f.scanned_at desc, f.id desc limit 1`);
    if (!row) return null;
    return {
      blockNumber: Number(row.block_to),
      fetchedAt: new Date(row.scanned_at as string | Date),
      dataStatus: row.status as DataStatus,
      statusReason: row.status_reason === null ? null : String(row.status_reason),
      providerRunIds: row.provider_run_id === null ? [] : [Number(row.provider_run_id)],
    };
  }

  /** Setoran ke exchange (dari klasifikasi perpindahan) dan kiriman bridge oleh address ini sampai blok tertentu. */
  async walletMovements(chainId: string, addressId: number, blockTo: number): Promise<MovementFact[]> {
    const rows = await this.rows(sql`
      select 'exchange_deposit' as kind, mc.classification, n.block_timestamp as at, n.chain_id, n.tx_hash
      from movement_classifications mc join native_transfers n on n.id = mc.native_transfer_id
      where mc.movement_type = 'exchange_deposit' and n.chain_id = ${chainId} and n.from_address_id = ${addressId} and n.block_number <= ${blockTo}
      union all
      select 'exchange_deposit', mc.classification, t.block_timestamp, t.chain_id, t.tx_hash
      from movement_classifications mc join token_transfers t on t.id = mc.token_transfer_id
      where mc.movement_type = 'exchange_deposit' and t.chain_id = ${chainId} and t.from_address_id = ${addressId} and t.block_number <= ${blockTo}
      union all
      select 'bridge_out', 'external_label', b.sent_at, b.source_chain_id, coalesce(n.tx_hash, t.tx_hash)
      from bridge_transfers b
      left join native_transfers n on n.id = b.sent_native_transfer_id
      left join token_transfers t on t.id = b.sent_token_transfer_id
      where b.source_chain_id = ${chainId} and b.sender_address_id = ${addressId} and coalesce(n.block_number, t.block_number) <= ${blockTo}`);
    return rows.map((row) => ({
      kind: row.kind === 'bridge_out' ? 'bridge_out' : 'exchange_deposit',
      classification: row.classification as InfoClassification,
      at: new Date(row.at as string | Date),
      evidence: { chainId: String(row.chain_id), txHash: String(row.tx_hash), evidenceId: null },
    }));
  }

  /**
   * Kelompok terkoordinasi yang buktinya berupa kiriman dana dari address ini.
   * `null` bila address ini tidak muncul di peta mana pun.
   */
  async fundedClusters(chainId: string, addressId: number): Promise<ClusterFact[] | null> {
    const [inMap] = await this.rows(sql`select 1 from map_nodes where chain_id = ${chainId} and address_id = ${addressId} limit 1`);
    if (!inMap) return null;
    return this.clusters(sql`exists (
      select 1 from map_cluster_signals s2
      join map_cluster_signal_evidence se2 on se2.signal_id = s2.id
      join native_transfers n2 on n2.id = se2.native_transfer_id
      where s2.cluster_id = c.id and n2.from_address_id = ${addressId})`);
  }

  async botLabels(addressId: number): Promise<Array<{ name: string | null; confidence: number | null }>> {
    const rows = await this.rows(sql`
      select l.name, l.confidence::float8 as confidence from labels l
      where l.address_id = ${addressId} and l.label_type = 'bot' and l.source = 'heuristic'
      order by l.confidence desc nulls last, l.id`);
    return rows.map((row) => ({ name: row.name === null ? null : String(row.name), confidence: row.confidence === null ? null : Number(row.confidence) }));
  }

  /* -------------------------------- Ringkasan ------------------------------- */

  /** Penilaian terbaru objek dengan metode ini (blok tertinggi, lalu waktu nilai terbaru). */
  async latestAssessment(chainId: string, addressId: number, methodology: string) {
    const [row] = await this.db
      .select()
      .from(riskAssessments)
      .where(and(eq(riskAssessments.chainId, chainId), eq(riskAssessments.addressId, addressId), eq(riskAssessments.methodology, methodology)))
      .orderBy(desc(riskAssessments.blockNumber), desc(riskAssessments.assessedAt), desc(riskAssessments.id))
      .limit(1);
    return row ?? null;
  }

  async assessmentParts(assessmentId: number) {
    const [reasons, warnings, traits, sources] = await Promise.all([
      this.db.select().from(riskReasons).where(eq(riskReasons.assessmentId, assessmentId)).orderBy(asc(riskReasons.position), asc(riskReasons.id)),
      this.db.select().from(riskWarnings).where(eq(riskWarnings.assessmentId, assessmentId)).orderBy(desc(riskWarnings.detectedAt), asc(riskWarnings.id)),
      this.db.select().from(riskTraitChecks).where(eq(riskTraitChecks.assessmentId, assessmentId)),
      this.rows(sql`
        select distinct r.provider from risk_assessment_sources s join provider_runs r on r.id = s.provider_run_id
        where s.assessment_id = ${assessmentId} order by r.provider`),
    ]);
    return { reasons, warnings, traits, sources: sources.map((row) => String(row.provider)) };
  }

  /** Nama dan simbol token, dan apakah token sudah punya peta hubungan. */
  async tokenInfo(tokenId: number): Promise<{ name: string | null; symbol: string | null; hasMap: boolean }> {
    const [row] = await this.rows(sql`
      select t.name, t.symbol, exists (select 1 from wallet_maps m where m.token_id = t.id) as has_map
      from tokens t where t.id = ${tokenId}`);
    return { name: row?.name == null ? null : String(row.name), symbol: row?.symbol == null ? null : String(row.symbol), hasMap: Boolean(row?.has_map) };
  }

  /* ------------------------------- Penyimpanan ------------------------------ */

  /** Simpan penilaian; penilaian lama dengan objek, blok, dan metode yang sama diganti. */
  async save(input: PersistInput): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(riskAssessments)
        .where(
          and(
            eq(riskAssessments.chainId, input.chainId),
            eq(riskAssessments.addressId, input.addressId),
            eq(riskAssessments.blockNumber, input.data.blockNumber),
            eq(riskAssessments.methodology, input.methodology),
          ),
        );
      const [assessment] = await tx
        .insert(riskAssessments)
        .values({
          chainId: input.chainId,
          addressId: input.addressId,
          objectKind: input.objectKind,
          tokenSnapshotId: input.tokenSnapshotId,
          methodology: input.methodology,
          score: input.draft.score,
          level: input.draft.level,
          dataStatus: input.dataStatus,
          statusReason: input.statusReason,
          blockNumber: input.data.blockNumber,
          fetchedAt: input.data.fetchedAt,
          assessedAt: input.assessedAt,
        })
        .returning({ id: riskAssessments.id });
      const runIds = [...new Set(input.data.providerRunIds)];
      if (runIds.length > 0) await tx.insert(riskAssessmentSources).values(runIds.map((providerRunId) => ({ assessmentId: assessment.id, providerRunId })));

      const reasonIds = new Map<string, number>();
      for (const [position, reason] of input.draft.reasons.entries()) {
        const [row] = await tx
          .insert(riskReasons)
          .values({
            assessmentId: assessment.id,
            code: reason.code,
            title: reason.title,
            description: reason.description,
            severity: reason.severity,
            classification: reason.classification,
            points: reason.points,
            position,
          })
          .returning({ id: riskReasons.id });
        reasonIds.set(reason.code, row.id);
        if (reason.evidence.length > 0) {
          await tx.insert(riskReasonEvidence).values(reason.evidence.map((item) => ({ reasonId: row.id, chainId: item.chainId, txHash: item.txHash, evidenceId: item.evidenceId })));
        }
      }

      const warningIds = new Map<string, number>();
      for (const warning of input.draft.warnings) {
        const [row] = await tx
          .insert(riskWarnings)
          .values({
            assessmentId: assessment.id,
            code: warning.code,
            trait: warning.trait,
            title: warning.title,
            description: warning.description,
            severity: warning.severity,
            classification: warning.classification,
            detectedAt: warning.detectedAt,
          })
          .returning({ id: riskWarnings.id });
        warningIds.set(warning.code, row.id);
        if (warning.evidence.length > 0) {
          await tx.insert(riskWarningEvidence).values(warning.evidence.map((item) => ({ warningId: row.id, chainId: item.chainId, txHash: item.txHash, evidenceId: item.evidenceId })));
        }
      }

      if (input.draft.traits.length > 0) {
        await tx.insert(riskTraitChecks).values(
          input.draft.traits.map((item) => ({
            assessmentId: assessment.id,
            trait: item.trait,
            status: item.status,
            note: item.note,
            reasonId: item.reasonCode ? (reasonIds.get(item.reasonCode) ?? null) : null,
            warningId: item.warningCode ? (warningIds.get(item.warningCode) ?? null) : null,
          })),
        );
      }
      return assessment.id;
    });
  }

  private async clusters(where: SQL): Promise<ClusterFact[]> {
    const rows = await this.rows(sql`
      select c.id, c.key, c.name, c.labels::text[] as labels, c.confidence,
        (select count(*)::int from map_cluster_members m where m.cluster_id = c.id) as member_count,
        array(
          select distinct coalesce(n.chain_id, t.chain_id) || '|' || coalesce(n.tx_hash, t.tx_hash)
          from map_cluster_signals s
          join map_cluster_signal_evidence se on se.signal_id = s.id
          left join native_transfers n on n.id = se.native_transfer_id
          left join token_transfers t on t.id = se.token_transfer_id
          where s.cluster_id = c.id and s.matched
        ) as evidence
      from map_clusters c where ${where}
      order by c.id`);
    return rows.map((row) => ({
      key: String(row.key),
      name: String(row.name),
      labels: (row.labels as ClusterLabel[]) ?? [],
      confidence: row.confidence as ConfidenceLevel,
      memberCount: Number(row.member_count),
      evidence: ((row.evidence as string[]) ?? []).map((item) => {
        const [chainId, txHash] = item.split('|');
        return { chainId, txHash, evidenceId: null };
      }),
    }));
  }

  private async rows(query: SQL): Promise<Raw[]> {
    const result = (await this.db.execute(query)) as unknown as { rows: Raw[] };
    return result.rows;
  }
}

function evidenceRef(row: Raw): EvidenceRef {
  return { chainId: String(row.chain_id), txHash: String(row.tx_hash), evidenceId: Number(row.evidence_id) };
}
