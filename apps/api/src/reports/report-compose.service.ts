/**
 * Susun isi laporan dari entitas yang sudah dianalisis: subjek dan temuan
 * kasus sumber, serta temuan penilaian risiko setiap entitas (subjek kasus
 * dan blok entitas di laporan) per chain. `picker` menampilkan kandidatnya
 * beserta tanda sudah ada di laporan; `compose` memasukkan pilihan sebagai
 * blok entitas dan klaim. Yang sudah ada dilewati, tidak digandakan.
 */
import { BadRequestException, ConflictException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CasesService } from '../cases/cases.service.js';
import type { CaseView } from '../cases/cases.types.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { sortFindings } from '../risk/risk-findings.mapper.js';
import { RiskFindingsService } from '../risk/risk-findings.service.js';
import { RiskSummaryService } from '../risk/risk-summary.service.js';
import {
  caseFindingClaim,
  ENTITY_SECTION,
  entityBlock,
  entityKey,
  FINDING_SECTION,
  insertAt,
  riskFindingClaim,
  riskFindingKey,
  subjectKey,
  type ComposedBlock,
} from './report-compose.js';
import type { ComposeInput } from './report-input.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';
import type { ReportComposeResult, ReportEntityView, ReportPickerResponse } from './reports.types.js';

type Analyzed = ReportPickerResponse['analyzed'][number];

interface Gathered {
  picker: ReportPickerResponse;
  /** Blok siap tulis per kunci kandidat. */
  entities: Map<string, ComposedBlock>;
  claims: Map<string, ComposedBlock>;
}

const message = (error: unknown) => (error instanceof HttpException ? String((error.getResponse() as { message?: unknown }).message ?? error.message) : null);

@Injectable()
export class ReportComposeService {
  constructor(
    private readonly reports: ReportsService,
    private readonly repository: ReportsRepository,
    private readonly cases: CasesService,
    private readonly riskFindings: RiskFindingsService,
    private readonly riskSummary: RiskSummaryService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async picker(id: number): Promise<ReportPickerResponse> {
    return (await this.gather(id)).picker;
  }

  async compose(id: number, input: ComposeInput): Promise<ReportComposeResult> {
    const row = await this.repository.find(id);
    if (!row) throw new NotFoundException(`Laporan ${id} tidak ditemukan.`);
    if (row.status === 'final') throw new ConflictException('Laporan final dikunci. Ubah statusnya ke review atau draft dulu sebelum menambah isi.');
    const { picker, entities, claims } = await this.gather(id);
    const unknown = [...input.subjects.filter((key) => !entities.has(key)), ...input.findings.filter((key) => !claims.has(key))];
    if (unknown.length > 0) throw new BadRequestException(`Kunci tidak dikenal untuk laporan ini: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? ', …' : ''}.`);

    const present = new Set([
      ...picker.subjects.filter((item) => item.inReport).map((item) => item.key),
      ...picker.findings.filter((item) => item.inReport).map((item) => item.key),
      ...picker.analyzed.flatMap((entity) => entity.findings.filter((item) => item.inReport).map((item) => item.key)),
    ]);
    const skipped = [...input.subjects, ...input.findings].filter((key) => present.has(key));
    const entityBlocks = input.subjects.filter((key) => !present.has(key)).map((key) => entities.get(key)!);
    const claimBlocks = input.findings.filter((key) => !present.has(key)).map((key) => claims.get(key)!);
    const now = this.clock.now();
    const added = await this.repository.db.transaction(async (tx) => {
      const ids = [
        ...(await this.repository.appendBlocks(tx, id, ENTITY_SECTION, entityBlocks, (titles) => insertAt(titles, ENTITY_SECTION), now)),
        ...(await this.repository.appendBlocks(tx, id, FINDING_SECTION, claimBlocks, (titles) => insertAt(titles, FINDING_SECTION), now)),
      ];
      if (ids.length > 0) await this.repository.updateReport(tx, id, { updatedAt: now });
      return ids;
    });
    return {
      report: await this.reports.get(id),
      addedSubjects: entityBlocks.length,
      addedFindings: claimBlocks.length,
      addedBlockIds: added.map(String),
      skipped,
    };
  }

  private async gather(id: number): Promise<Gathered> {
    const report = await this.reports.get(id);
    const present = await this.repository.sourceKeys(id);
    const reportEntities = report.sections.flatMap((section) => section.blocks.flatMap((block) => (block.kind === 'entity' ? [block.subject] : [])));
    for (const subject of reportEntities) present.add(entityKey(subjectKey(subject)));

    let source: CaseView | null = null;
    if (report.source?.caseId) {
      source = await this.cases.get(Number(report.source.caseId)).catch((error: unknown) => {
        if (error instanceof NotFoundException) return null;
        throw error;
      });
    }
    const entities = new Map<string, ComposedBlock>();
    const claims = new Map<string, ComposedBlock>();
    const stored = new Set((source?.evidence ?? []).filter((item) => item.stored).map((item) => `${item.chain}:${item.txHash}`));

    const subjects = (source?.subjects ?? []).map((subject) => {
      const key = subjectKey(subject);
      entities.set(key, entityBlock(subject));
      return { key, subject: { kind: subject.kind, chain: subject.chain, address: subject.address, title: subject.title, href: subject.href }, inReport: present.has(entityKey(key)) };
    });
    const findings = (source?.findings ?? []).map((finding) => {
      const block = caseFindingClaim(finding, source!.snapshot);
      claims.set(block.sourceKey, block);
      return {
        key: block.sourceKey,
        title: finding.title,
        detail: finding.detail,
        classification: finding.classification,
        inReport: present.has(block.sourceKey),
        evidenceCount: finding.evidence.length,
        storedCount: finding.evidence.filter((item) => stored.has(`${item.chain}:${item.txHash}`)).length,
      };
    });

    // Entitas teranalisis: subjek kasus dan blok entitas laporan, tanpa kembar.
    const targets = new Map<string, Pick<ReportEntityView, 'kind' | 'chain' | 'address' | 'title'>>();
    for (const subject of [...(source?.subjects ?? []), ...reportEntities]) {
      const key = subjectKey(subject);
      if (!targets.has(key)) targets.set(key, subject);
    }
    const analyzed: Analyzed[] = [];
    for (const [key, subject] of targets) analyzed.push(...(await this.analyze(key, subject, present, claims)));

    const caveats = ['Temuan dugaan (heuristic) dan label eksternal bisa keliru; cek hash buktinya sebelum memasukkannya sebagai klaim.'];
    if (!report.source) caveats.push('Laporan ini tidak punya kasus sumber; hanya entitas di laporan yang bisa diambil temuan risikonya.');
    else if (!source) caveats.push(`Kasus sumber "${report.source.title}" sudah dihapus; subjek dan temuannya tidak bisa diambil lagi.`);
    if (analyzed.some((entry) => entry.status === 'no_data')) caveats.push('Entitas yang belum bisa dinilai bukan berarti aman.');
    return {
      picker: {
        reportId: report.id,
        status: report.status,
        source: report.source?.caseId ? { caseId: report.source.caseId, title: report.source.title } : null,
        subjects,
        findings,
        analyzed,
        caveats,
      },
      entities,
      claims,
    };
  }

  /** Temuan penilaian risiko satu entitas; tanpa chain dinilai di setiap chain tempat address-nya tercatat. */
  private async analyze(key: string, subject: Pick<ReportEntityView, 'chain' | 'address' | 'title'>, present: Set<string>, claims: Map<string, ComposedBlock>): Promise<Analyzed[]> {
    const noData = (chain: string | null, reason: string): Analyzed => ({
      subjectKey: key,
      title: subject.title,
      chain,
      address: subject.address,
      status: 'no_data',
      reason,
      objectKind: null,
      score: null,
      level: null,
      methodology: null,
      findings: [],
    });
    let chains: Array<{ chain: string; reason: string | null }>;
    if (subject.chain) chains = [{ chain: subject.chain, reason: null }];
    else {
      try {
        const multichain = await this.riskSummary.multichain(subject.address);
        chains = multichain.chains.map((item) => ({ chain: item.chain, reason: item.status === 'no_data' ? item.reason : null }));
      } catch (error) {
        const reason = message(error);
        if (reason === null) throw error;
        return [noData(null, reason)];
      }
    }
    const result: Analyzed[] = [];
    for (const { chain, reason } of chains) {
      if (reason !== null) {
        result.push(noData(chain, reason));
        continue;
      }
      try {
        const { object, assessment, all, sources } = await this.riskFindings.collect(chain, subject.address);
        const context = {
          chain,
          address: object.address,
          subjectTitle: subject.title,
          methodology: assessment.methodology,
          score: assessment.score,
          sources,
          fetchedAt: assessment.fetchedAt,
        };
        result.push({
          subjectKey: key,
          title: subject.title,
          chain,
          address: object.address,
          status: 'assessed',
          reason: null,
          objectKind: assessment.objectKind,
          score: assessment.score,
          level: assessment.level,
          methodology: assessment.methodology,
          findings: sortFindings(all).map((finding) => {
            const block = riskFindingClaim(finding, context);
            claims.set(block.sourceKey, block);
            return {
              key: riskFindingKey(chain, object.address, finding.kind, finding.id),
              kind: finding.kind,
              code: finding.id,
              title: finding.title,
              severity: finding.severity,
              classification: finding.classification,
              points: finding.points,
              inReport: present.has(block.sourceKey),
              evidenceCount: finding.evidence.length,
              storedCount: finding.evidence.filter((item) => item.stored).length,
            };
          }),
        });
      } catch (error) {
        const reason = message(error);
        if (reason === null) throw error;
        result.push(noData(chain, reason));
      }
    }
    return result;
  }
}
