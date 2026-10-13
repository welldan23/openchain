import { riskLinks, riskTitle, scoreBreakdown } from './risk-summary.mapper.js';

describe('ringkasan skor risiko', () => {
  it('asal poin per jenis informasi urut dari bukti terkuat; alasan tanpa poin dihitung terpisah', () => {
    expect(
      scoreBreakdown(33, [
        { classification: 'heuristic', points: 10 },
        { classification: 'verified_fact', points: 20 },
        { classification: 'verified_fact', points: 3 },
        { classification: 'assumption', points: null },
      ]),
    ).toEqual({
      parts: [
        { classification: 'verified_fact', points: 23, reasonCount: 2 },
        { classification: 'heuristic', points: 10, reasonCount: 1 },
      ],
      countedPoints: 33,
      uncounted: 1,
      unexplained: 0,
    });
  });

  it('skor yang dibatasi 100 tidak dianggap punya poin tak terjelaskan; skor kosong tidak punya selisih', () => {
    expect(scoreBreakdown(100, [{ classification: 'verified_fact', points: 130 }]).unexplained).toBe(0);
    expect(scoreBreakdown(40, [{ classification: 'verified_fact', points: 30 }]).unexplained).toBe(10);
    expect(scoreBreakdown(null, []).unexplained).toBeNull();
  });

  it('judul: nama token, lalu nama label, lalu address dipendekkan', () => {
    const label = { type: 'exchange' as const, name: 'Bybit', source: 'external' as const, sourceName: 'Blockscout' };
    expect(riskTitle('token', '0xabc', { name: 'Brett', symbol: 'BRETT' }, null)).toBe('Brett (BRETT)');
    expect(riskTitle('token', '0xabc', { name: null, symbol: 'BRETT' }, null)).toBe('BRETT');
    expect(riskTitle('wallet', '0x' + 'a'.repeat(40), null, label as never)).toBe('Bybit');
    expect(riskTitle('wallet', '0x' + 'a'.repeat(40), null, null)).toBe('0xaaaa…aaaa');
  });

  it('tautan: token ke halaman token (dan peta bila ada); wallet ke aliran dana (dan multichain untuk EVM)', () => {
    expect(riskLinks('token', 'base', '0xT', 'evm', true)).toEqual([
      { kind: 'token', href: '/token/base/0xT' },
      { kind: 'map', href: '/map/base/0xT' },
    ]);
    expect(riskLinks('wallet', 'solana', 'Sol1', 'solana', false)).toEqual([{ kind: 'flow', href: '/flow/solana/Sol1' }]);
    expect(riskLinks('contract', 'base', '0xC', 'evm', false).map((link) => link.kind)).toEqual(['flow', 'multichain']);
  });
});
