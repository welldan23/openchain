import { CHECK_RULES, MAX_EVIDENCE_PER_ITEM, scoreContract, scoreToken, scoreWallet, type CheckFact, type ClusterFact, type MovementFact } from './risk-rules.js';

const DATA_AT = new Date('2026-10-03T00:00:00Z');
const ev = (n: number) => ({ chainId: 'base', txHash: `0x${n.toString(16).padStart(64, '0')}`, evidenceId: null });
const check = (code: string, status: CheckFact['status'], classification: CheckFact['classification'] = 'external_label', evidence = [ev(1)]): CheckFact => ({
  code,
  status,
  value: `${code} ${status}`,
  classification: status === 'unknown' ? null : classification,
  evidence: status === 'unknown' ? [] : evidence,
});
const cluster = (overrides: Partial<ClusterFact> = {}): ClusterFact => ({
  key: 'k1',
  name: 'Kelompok A',
  labels: ['common_funding'],
  confidence: 'medium',
  memberCount: 5,
  evidence: [ev(9)],
  ...overrides,
});
const traitOf = (draft: ReturnType<typeof scoreToken>, name: string) => draft.traits.find((item) => item.trait === name);

describe('skoring risiko token', () => {
  it('menjumlahkan poin cek kontrak, konsentrasi holder, dan kelompok terkoordinasi; tingkat mengikuti skor', () => {
    const draft = scoreToken({
      checks: [check('honeypot', 'fail'), check('tax', 'warn'), check('mint', 'pass'), check('proxy', 'warn', 'verified_fact'), check('kode_lain', 'fail')],
      top10Pct: 82.36,
      clusters: [cluster({ confidence: 'low' }), cluster({ key: 'k2', name: 'Kelompok B', confidence: 'high', memberCount: 3 }), cluster({ key: 'k3', labels: ['visual_cluster'] })],
    });
    // 40 honeypot + 10 tax + 10 proxy + 15 holder + 15 kelompok kuat.
    expect(draft.score).toBe(90);
    expect(draft.level).toBe('critical');
    expect(draft.unratedReason).toBeNull();
    expect(draft.reasons.map((reason) => [reason.code, reason.points])).toEqual([
      ['check_honeypot', 40],
      ['bundled_launch', 15],
      ['holder_concentration', 15],
      ['check_proxy', 10],
      ['check_tax', 10],
    ]);
    expect(draft.reasons.find((reason) => reason.code === 'holder_concentration')).toMatchObject({ title: '10 holder teratas memegang 82.4% supply', classification: 'derived_metric' });
    expect(draft.reasons.find((reason) => reason.code === 'bundled_launch')?.title).toBe('2 kelompok holder terlihat terkoordinasi');
    expect(traitOf(draft, 'sell_blocked')).toMatchObject({ status: 'detected', reasonCode: 'check_honeypot' });
    expect(traitOf(draft, 'mint_active')).toMatchObject({ status: 'clear', note: 'mint pass.' });
    expect(traitOf(draft, 'blacklist')).toMatchObject({ status: 'unknown' });
    expect(traitOf(draft, 'liquidity_pulled')).toMatchObject({ status: 'unknown' });
  });

  it('skor maksimal 100; asumsi tidak berpoin; cek "tidak tersedia" tidak dijadikan alasan', () => {
    const all = Object.keys(CHECK_RULES).map((code) => check(code, 'fail'));
    expect(scoreToken({ checks: all, top10Pct: 99, clusters: [cluster({ confidence: 'high' })] }).score).toBe(100);
    const assumption = scoreToken({ checks: [check('liquidity-lock', 'warn', 'assumption')], top10Pct: null, clusters: null });
    expect(assumption.reasons[0]).toMatchObject({ code: 'check_liquidity-lock', points: null });
    expect(assumption.score).toBe(0);
    const unavailable = scoreToken({ checks: [check('tax', 'fail', 'unavailable')], top10Pct: null, clusters: null });
    expect(unavailable.reasons).toEqual([]);
  });

  it('tanpa data yang bisa dinilai: skor kosong dan tingkat unknown, bukan nol', () => {
    const draft = scoreToken({ checks: [check('tax', 'unknown'), check('honeypot', 'unknown')], top10Pct: null, clusters: null });
    expect(draft).toMatchObject({ score: null, level: 'unknown' });
    expect(draft.unratedReason).toContain('Belum ada');
    expect(traitOf(draft, 'tax_change')).toMatchObject({ status: 'unknown', note: 'Belum bisa diperiksa: tax unknown.' });
    expect(traitOf(draft, 'bundled_launch')).toMatchObject({ status: 'unknown' });
  });

  it('konsentrasi di bawah 50% dan peta tanpa kelompok terkoordinasi tercatat tidak terdeteksi', () => {
    const draft = scoreToken({ checks: [], top10Pct: 31.2, clusters: [cluster({ labels: ['false_positive_possible'] })] });
    expect(draft).toMatchObject({ score: 0, level: 'low', reasons: [] });
    expect(traitOf(draft, 'holder_concentration')?.status).toBe('clear');
    expect(traitOf(draft, 'bundled_launch')?.status).toBe('clear');
  });

  it('bukti dibatasi dan tidak dobel', () => {
    const many = Array.from({ length: 20 }, (_, index) => ev(index % 15));
    const draft = scoreToken({ checks: [check('tax', 'fail', 'external_label', many)], top10Pct: null, clusters: null });
    expect(draft.reasons[0].evidence).toHaveLength(MAX_EVIDENCE_PER_ITEM);
  });
});

describe('skoring risiko wallet', () => {
  const move = (kind: MovementFact['kind'], daysBefore: number, n: number, classification: MovementFact['classification'] = 'external_label'): MovementFact => ({
    kind,
    classification,
    at: new Date(DATA_AT.getTime() - daysBefore * 86_400_000),
    evidence: ev(n),
  });

  it('setoran exchange dan bridge jadi alasan; yang 7 hari terakhir juga jadi peringatan', () => {
    const draft = scoreWallet(
      {
        movements: [move('exchange_deposit', 30, 1), move('exchange_deposit', 2, 2, 'heuristic'), move('bridge_out', 40, 3)],
        fundedClusters: [cluster({ confidence: 'high' })],
        botLabels: [{ name: 'Bot sniper', confidence: 0.6 }],
      },
      DATA_AT,
    );
    expect(draft.reasons.map((reason) => [reason.code, reason.points])).toEqual([
      ['funds_coordinated_group', 15],
      ['bot_label', 5],
      ['bridge_hop', 5],
      ['exchange_cashout', 5],
    ]);
    expect(draft).toMatchObject({ score: 30, level: 'medium' });
    expect(draft.reasons.find((reason) => reason.code === 'exchange_cashout')).toMatchObject({ title: '2 setoran ke exchange', classification: 'heuristic' });
    expect(draft.warnings).toHaveLength(1);
    expect(draft.warnings[0]).toMatchObject({ code: 'recent_exchange_cashout', trait: 'exchange_cashout', detectedAt: new Date(DATA_AT.getTime() - 2 * 86_400_000) });
    expect(traitOf(draft, 'exchange_cashout')).toMatchObject({ status: 'detected', warningCode: 'recent_exchange_cashout' });
    expect(traitOf(draft, 'bridge_hop')).toMatchObject({ status: 'detected', reasonCode: 'bridge_hop' });
    expect(traitOf(draft, 'fresh_wallet_funding')?.status).toBe('unknown');
  });

  it('wallet terpindai tanpa pola berisiko: skor 0, ciri tidak terdeteksi atau belum bisa dicek', () => {
    const draft = scoreWallet({ movements: [], fundedClusters: null, botLabels: [] }, DATA_AT);
    expect(draft).toMatchObject({ score: 0, level: 'low', reasons: [], warnings: [] });
    expect(traitOf(draft, 'exchange_cashout')?.status).toBe('clear');
    expect(traitOf(draft, 'bundled_launch')?.status).toBe('unknown');
  });
});

describe('skoring risiko kontrak', () => {
  it('kontrak selain token belum dinilai, semua cirinya belum bisa dicek', () => {
    const draft = scoreContract();
    expect(draft).toMatchObject({ objectKind: 'contract', score: null, level: 'unknown' });
    expect(draft.traits.every((item) => item.status === 'unknown' && item.note)).toBe(true);
  });
});
