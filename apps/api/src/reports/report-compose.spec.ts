import type { RiskFindingView } from '../risk/risk.types.js';
import { caseFindingClaim, ENTITY_SECTION, entityBlock, FINDING_SECTION, insertAt, providerFor, riskFindingClaim, subjectKey } from './report-compose.js';
import { parseCompose } from './report-input.js';

const HASH = '0x' + 'ab'.repeat(32);
const riskFinding = (overrides: Partial<RiskFindingView> = {}): RiskFindingView => ({
  id: 'check_tax',
  kind: 'reason',
  title: 'Pajak transaksi berisiko',
  description: 'Beli 2% · Jual 5%.',
  severity: 'high',
  classification: 'verified_fact',
  classificationInfo: { name: 'Fakta on-chain', description: '' },
  points: 20,
  trait: 'tax_change',
  detectedAt: null,
  evidence: [{ chain: 'base', txHash: HASH, stored: false, explorerUrl: null }],
  ...overrides,
});
const context = { chain: 'base', address: '0xABC', subjectTitle: 'NBLA', methodology: 'openchain-risk-v1', score: 33, sources: ['blockscout', 'goplus'], fetchedAt: new Date('2026-10-03T04:30:00Z') };

describe('penyusun isi laporan', () => {
  it('kunci subjek sama dengan frontend; entitas membawa kunci asalnya', () => {
    expect(subjectKey({ kind: 'address', chain: null, address: '0xABC' })).toBe('address:multichain:0xabc');
    expect(entityBlock({ kind: 'token', chain: 'base', address: '0xABC', title: 'NBLA', href: '/token/base/0xABC' })).toMatchObject({
      kind: 'entity',
      sourceKey: 'subject:token:base:0xabc',
      subject: { chain: 'base', title: 'NBLA' },
    });
  });

  it('provider: dugaan disebut heuristic OpenChain beserta datanya; tanpa sumber dibiarkan kosong', () => {
    expect(providerFor('heuristic', ['blockscout'])).toBe('OpenChain heuristic (data: blockscout)');
    expect(providerFor('verified_fact', ['blockscout', 'goplus'])).toBe('blockscout, goplus');
    expect(providerFor('external_label', [])).toBeNull();
  });

  it('klaim dari temuan kasus memakai waktu dan provider snapshot kasus', () => {
    const block = caseFindingClaim(
      { id: 'kelompok-a', title: 'Pendana bersama', detail: '5 wallet', classification: 'heuristic', evidence: [{ chain: 'base', txHash: HASH }] },
      { fetchedAt: '2026-10-03T04:00:00.000Z', sources: ['blockscout'] },
    );
    expect(block).toMatchObject({
      sourceKey: 'case:kelompok-a',
      claim: { provider: 'OpenChain heuristic (data: blockscout)', evidence: [{ chain: 'base', txHash: HASH }] },
    });
    expect(block.kind === 'claim' && block.claim.observedAt?.toISOString()).toBe('2026-10-03T04:00:00.000Z');
  });

  it('klaim dari temuan risiko menyebut entitas, sumbangan poin atau bahwa peringatan tidak menambah skor', () => {
    const reason = riskFindingClaim(riskFinding(), context);
    expect(reason).toMatchObject({
      sourceKey: 'risk:base:0xabc:reason:check_tax',
      claim: { title: 'NBLA: Pajak transaksi berisiko', provider: 'blockscout, goplus', observedAt: context.fetchedAt, classification: 'verified_fact' },
    });
    expect(reason.kind === 'claim' && reason.claim.detail).toBe('Beli 2% · Jual 5%. Menyumbang 20 poin ke skor 33 (openchain-risk-v1).');
    const warning = riskFindingClaim(riskFinding({ id: 'liquidity_drop', kind: 'warning', points: null, classification: 'derived_metric' }), context);
    expect(warning.sourceKey).toBe('risk:base:0xabc:warning:liquidity_drop');
    expect(warning.kind === 'claim' && warning.claim.detail).toContain('Peringatan dini; tidak menambah skor.');
    const long = riskFindingClaim(riskFinding({ title: 'x'.repeat(300) }), context);
    expect(long.kind === 'claim' && long.claim.title.length).toBe(200);
  });

  it('bagian baru: entitas setelah Ringkasan atau paling awal, temuan setelah entitas atau paling akhir', () => {
    expect(insertAt(['Ringkasan', 'Kesimpulan'], ENTITY_SECTION)).toBe(1);
    expect(insertAt(['Kesimpulan'], ENTITY_SECTION)).toBe(0);
    expect(insertAt(['Ringkasan', ENTITY_SECTION, 'Kesimpulan'], FINDING_SECTION)).toBe(2);
    expect(insertAt(['Ringkasan', 'Kesimpulan'], FINDING_SECTION)).toBe(2);
  });

  it('isi permintaan susun: minimal satu kunci, tanpa kembar', () => {
    expect(parseCompose({ subjects: ['a', 'a'], findings: ['case:x'] })).toEqual({ subjects: ['a'], findings: ['case:x'] });
    expect(() => parseCompose({})).toThrow('Pilih minimal satu');
    expect(() => parseCompose({ findings: 'case:x' })).toThrow('harus berupa daftar');
  });
});
