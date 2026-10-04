import { detectCoordination, type FundingMove, type HolderMove } from './coordination-detection.js';

const T0 = Date.UTC(2026, 9, 1, 8, 0, 0);
const at = (seconds: number) => new Date(T0 + seconds * 1000);
let seq = 0;
const funding = (funder: number, holder: number, seconds: number, amountRaw = '1000000000000000000'): FundingMove => ({
  funderNodeId: funder,
  holderNodeId: holder,
  ref: { table: 'native', id: ++seq },
  blockNumber: 1000 + Math.floor(seconds / 12),
  timestamp: at(seconds),
  amountRaw,
});
const move = (holder: number, block: number, seconds = block * 12): HolderMove => ({
  holderNodeId: holder,
  ref: { table: 'token', id: ++seq },
  blockNumber: block,
  timestamp: at(seconds),
});
const addressOf = (id: number) => `0x${String(id).padStart(40, '0')}`;
const run = (input: { fundings?: FundingMove[]; buys?: HolderMove[]; sells?: HolderMove[] }) =>
  detectCoordination({ fundings: input.fundings ?? [], buys: input.buys ?? [], sells: input.sells ?? [], addressOf });

describe('detectCoordination', () => {
  it('mendeteksi pendanaan beruntun dari satu pendana dalam 10 menit', () => {
    const fundings = [funding(9, 1, 0, '100'), funding(9, 2, 120, '250'), funding(9, 3, 540, '900'), funding(9, 4, 3600, '50')];
    const [burst, ...rest] = run({ fundings });
    expect(rest).toEqual([]);
    expect(burst).toMatchObject({
      kind: 'funding_burst',
      memberNodeIds: [1, 2, 3],
      windowSeconds: 540,
      blockNumber: null,
      confidence: 'medium',
      startedAt: at(0),
      detail: '3 wallet didanai 0x0000…0009 dalam 9 menit.',
    });
    expect(burst.txs).toEqual(fundings.slice(0, 3).map((item) => ({ action: 'funding', ref: item.ref })));
  });

  it('dua wallet saja belum disebut beruntun; pendana berbeda tidak digabung', () => {
    expect(run({ fundings: [funding(9, 1, 0, '1'), funding(9, 2, 60, '5'), funding(8, 3, 30, '9')] })).toEqual([]);
  });

  it('mendeteksi jumlah pendanaan yang hampir sama walau waktunya berjauhan', () => {
    const fundings = [funding(9, 1, 0, '1000'), funding(9, 2, 7200, '1005'), funding(9, 3, 14400, '1010'), funding(9, 4, 20000, '2000')];
    const [similar] = run({ fundings });
    expect(similar).toMatchObject({ kind: 'similar_amount', memberNodeIds: [1, 2, 3], confidence: 'low' });
    expect(similar.detail).toContain('3 wallet menerima jumlah yang hampir sama');
  });

  it('mendeteksi pembelian di blok yang sama sebagai pola bundler', () => {
    const buys = [move(1, 500), move(2, 500), move(3, 500), move(4, 501), move(1, 502)];
    const [bundle] = run({ buys });
    expect(bundle).toMatchObject({ kind: 'same_block_buy', memberNodeIds: [1, 2, 3], blockNumber: 500, windowSeconds: 0, confidence: 'high' });
    expect(bundle.txs.every((tx) => tx.action === 'buy')).toBe(true);
    expect(run({ buys: [move(1, 500), move(1, 500)] })).toEqual([]);
  });

  it('mendeteksi penjualan berdekatan dan memisahkan rentang yang berjauhan', () => {
    const sells = [move(1, 700, 0), move(2, 710, 120), move(3, 900, 5000), move(4, 905, 5100), move(5, 2000, 9000)];
    const events = run({ sells });
    expect(events.map((item) => [item.kind, item.memberNodeIds, item.confidence])).toEqual([
      ['coordinated_sell', [1, 2], 'medium'],
      ['coordinated_sell', [3, 4], 'medium'],
    ]);
    expect(events[0].detail).toBe('2 wallet menjual token dalam 2 menit.');
    const [same] = run({ sells: [move(1, 700, 0), move(2, 700, 0)] });
    expect(same).toMatchObject({ blockNumber: 700, confidence: 'high', detail: '2 wallet menjual token di blok yang sama.' });
  });
});
