import { scoreToken, scoreWallet, type CheckFact } from './risk-rules.js';
import { detectTokenWarnings, detectWalletWarnings, withWarnings, type FundingFact, type TokenPoint } from './risk-warnings.js';

const check = (code: string, status: CheckFact['status'], value: string): CheckFact => ({
  code,
  status,
  value,
  classification: 'verified_fact',
  evidence: [{ chainId: 'base', txHash: `0x${code}`, evidenceId: 1 }],
});
const point = (overrides: Partial<TokenPoint> = {}): TokenPoint => ({
  blockNumber: 100,
  fetchedAt: new Date('2026-10-01T00:00:00Z'),
  top10Pct: 40,
  liquidityUsd: 50_000,
  priceUsd: 1,
  checks: [check('tax', 'warn', 'Beli 2% / jual 2%'), check('mint', 'pass', 'Tidak ada fungsi mint'), check('proxy', 'unknown', 'Belum dicek')],
  ...overrides,
});
const NOW = new Date('2026-10-03T00:00:00Z');

describe('peringatan dini token', () => {
  it('satu snapshot saja: tidak ada peringatan, penarikan likuiditas belum bisa dipantau', () => {
    const result = detectTokenWarnings(point(), null);
    expect(result.warnings).toEqual([]);
    expect(result.traits).toEqual([expect.objectContaining({ trait: 'liquidity_pulled', status: 'unknown' })]);
  });

  it('cek kontrak memburuk dan nilai pajak berubah; status unknown tidak dianggap berubah', () => {
    const previous = point();
    const current = point({
      blockNumber: 200,
      fetchedAt: NOW,
      checks: [check('tax', 'warn', 'Beli 2% / jual 5%'), check('mint', 'fail', 'Owner bisa mencetak'), check('proxy', 'fail', 'Proxy')],
    });
    const { warnings, traits } = detectTokenWarnings(current, previous);
    expect(warnings.map((item) => [item.code, item.trait, item.severity])).toEqual([
      ['changed_tax', 'tax_change', 'medium'],
      ['worsened_mint', 'mint_active', 'high'],
    ]);
    expect(warnings[0]).toMatchObject({ title: 'Nilai pajak transaksi berubah', detectedAt: NOW, evidence: [{ txHash: '0xtax' }] });
    expect(warnings[0].description).toContain('"Beli 2% / jual 2%"');
    expect(warnings[0].description).toContain('blok 100 → 200');
    expect(traits.find((item) => item.trait === 'mint_active')).toMatchObject({ status: 'detected', warningCode: 'worsened_mint' });
  });

  it('likuiditas turun tajam dan porsi holder melonjak jadi peringatan berbasis hitungan', () => {
    const { warnings, traits } = detectTokenWarnings(point({ blockNumber: 200, fetchedAt: NOW, liquidityUsd: 8_000, priceUsd: 0.9, top10Pct: 55 }), point());
    expect(warnings.map((item) => [item.code, item.severity, item.classification])).toEqual([
      ['liquidity_drop', 'high', 'derived_metric'],
      ['concentration_rising', 'medium', 'derived_metric'],
    ]);
    expect(warnings[0].title).toBe('Likuiditas turun 84%');
    expect(warnings[0].description).toContain('$50,000 ke $8,000');
    expect(warnings[0].description).toContain('Harga token berubah -10%');
    expect(traits).toContainEqual(expect.objectContaining({ trait: 'liquidity_pulled', status: 'detected', warningCode: 'liquidity_drop' }));
  });

  it('likuiditas stabil atau terlalu kecil tetap belum bisa dipastikan, bukan aman', () => {
    const stable = detectTokenWarnings(point({ blockNumber: 200, liquidityUsd: 45_000 }), point());
    expect(stable.warnings).toEqual([]);
    expect(stable.traits[0]).toMatchObject({ trait: 'liquidity_pulled', status: 'unknown' });
    expect(stable.traits[0].note).toContain('Tidak ada penurunan tajam');
    const tiny = detectTokenWarnings(point({ blockNumber: 200, liquidityUsd: 10 }), point({ liquidityUsd: 500 }));
    expect(tiny.warnings).toEqual([]);
    expect(tiny.traits[0].note).toContain('terlalu kecil');
  });

  it('digabung ke draf: skor tetap, ciri diganti peringatan, ciri dari alasan tidak ditimpa catatan', () => {
    const current = point({ blockNumber: 200, fetchedAt: NOW, checks: [check('tax', 'fail', 'Jual 30%')], liquidityUsd: 49_000 });
    const draft = scoreToken({ checks: current.checks, top10Pct: 40, clusters: null });
    const merged = withWarnings(draft, detectTokenWarnings(current, point()));
    expect(merged.score).toBe(draft.score);
    expect(merged.warnings.map((item) => item.code)).toEqual(['worsened_tax']);
    expect(merged.traits.find((item) => item.trait === 'tax_change')).toMatchObject({ status: 'detected', warningCode: 'worsened_tax', reasonCode: null });
    expect(merged.traits.find((item) => item.trait === 'liquidity_pulled')?.note).toContain('Tidak ada penurunan tajam');
    expect(merged.traits.filter((item) => item.trait === 'liquidity_pulled')).toHaveLength(1);
  });
});

describe('peringatan dini wallet: mendanai wallet baru', () => {
  const funding = (recipient: string, at: string, recipientHistory: FundingFact['recipientHistory']): FundingFact => ({
    recipient,
    at: new Date(at),
    evidence: { chainId: 'base', txHash: `0x${recipient}`, evidenceId: null },
    recipientHistory,
  });

  it('kiriman ke wallet tanpa riwayat dalam 7 hari jadi peringatan; penerima yang belum dipindai disebut', () => {
    const { warnings, traits } = detectWalletWarnings(
      [funding('a', '2026-10-02T00:00:00Z', 'fresh'), funding('b', '2026-10-01T00:00:00Z', 'fresh'), funding('c', '2026-10-01T00:00:00Z', 'unknown'), funding('d', '2026-09-01T00:00:00Z', 'fresh')],
      NOW,
    );
    expect(warnings).toEqual([
      expect.objectContaining({ code: 'fresh_wallet_funding', title: 'Mendanai 2 wallet baru', severity: 'low', classification: 'derived_metric', detectedAt: new Date('2026-10-02T00:00:00Z') }),
    ]);
    expect(warnings[0].evidence.map((item) => item.txHash)).toEqual(['0xa', '0xb']);
    expect(warnings[0].description).toContain('1 penerima lain belum dipindai');
    expect(traits).toEqual([expect.objectContaining({ trait: 'fresh_wallet_funding', status: 'detected', warningCode: 'fresh_wallet_funding' })]);
  });

  it('tanpa bukti wallet baru: lama, belum dipindai, atau semua punya riwayat', () => {
    expect(detectWalletWarnings([funding('d', '2026-09-01T00:00:00Z', 'fresh')], NOW).traits[0]).toMatchObject({ status: 'detected', warningCode: null });
    expect(detectWalletWarnings([funding('c', '2026-10-01T00:00:00Z', 'unknown')], NOW).traits[0]).toMatchObject({ status: 'unknown' });
    expect(detectWalletWarnings([funding('e', '2026-10-01T00:00:00Z', 'has_history')], NOW).traits[0]).toMatchObject({ status: 'clear' });
    expect(detectWalletWarnings([], NOW).traits[0]).toMatchObject({ status: 'clear' });
    const merged = withWarnings(scoreWallet({ movements: [], fundedClusters: null, botLabels: [] }, NOW), detectWalletWarnings([], NOW));
    expect(merged.traits.filter((item) => item.trait === 'fresh_wallet_funding')).toEqual([expect.objectContaining({ status: 'clear' })]);
  });
});
