import { labelOptions, type PrimaryLabelCount } from './label-options.js';

const rank = (chainId: string) => ['robinhood', 'ethereum', 'base'].indexOf(chainId);
const row = (chainId: string, type: PrimaryLabelCount['type'], source: PrimaryLabelCount['source'], sourceName: string, count: number): PrimaryLabelCount => ({
  chainId,
  type,
  source,
  sourceName,
  count,
});
const rows = [
  row('base', 'exchange', 'external', 'Blockscout', 3),
  row('ethereum', 'exchange', 'external', 'Blockscout', 2),
  row('base', 'whale', 'heuristic', 'OpenChain heuristic', 4),
  row('base', 'burn', 'heuristic', 'OpenChain heuristic', 1),
  row('ethereum', 'router', 'external', 'Etherscan', 1),
  row('ethereum', 'bot', 'user', 'User', 1),
];

describe('pilihan filter label', () => {
  it('tanpa filter: jenis terbanyak dulu, sumber dengan nama penyedianya, chain urut baku', () => {
    const options = labelOptions(rows, { chains: [], labelSource: 'all' }, rank);
    expect(options.labeledAddresses).toBe(12);
    expect(options.types.map((item) => [item.type, item.count])).toEqual([
      ['exchange', 5],
      ['whale', 4],
      ['router', 1],
      ['bot', 1],
      ['burn', 1],
    ]);
    expect(options.types[0].bySource).toEqual({ external: 5, heuristic: 0, user: 0 });
    expect(options.sources).toEqual([
      { source: 'external', count: 6, providers: [{ name: 'Blockscout', count: 5 }, { name: 'Etherscan', count: 1 }] },
      { source: 'heuristic', count: 5, providers: [{ name: 'OpenChain heuristic', count: 5 }] },
      { source: 'user', count: 1, providers: [{ name: 'User', count: 1 }] },
    ]);
    expect(options.chains).toEqual([
      { chain: 'ethereum', count: 4 },
      { chain: 'base', count: 8 },
    ]);
  });

  it('dengan filter: pilihan tetap ada, jumlah mengikuti filter dimensi lain', () => {
    const options = labelOptions(rows, { chains: ['base'], labelSource: 'external' }, rank);
    expect(options.labeledAddresses).toBe(3);
    // Jenis yang habis tersaring tetap jadi pilihan dengan jumlah 0.
    expect(options.types.map((item) => [item.type, item.count])).toEqual([
      ['exchange', 3],
      ['router', 0],
      ['bot', 0],
      ['whale', 0],
      ['burn', 0],
    ]);
    expect(options.types.find((item) => item.type === 'whale')?.bySource).toEqual({ external: 0, heuristic: 4, user: 0 });
    // Sumber dihitung di chain terpilih saja, tanpa filter sumber.
    expect(options.sources.map((item) => [item.source, item.count])).toEqual([
      ['external', 3],
      ['heuristic', 5],
      ['user', 0],
    ]);
    expect(options.sources[2].providers).toEqual([]);
    // Chain dihitung dengan filter sumber, tanpa filter chain.
    expect(options.chains).toEqual([
      { chain: 'ethereum', count: 3 },
      { chain: 'base', count: 3 },
    ]);
  });

  it('data kosong: tidak ada pilihan, bukan nol palsu', () => {
    expect(labelOptions([], { chains: [], labelSource: 'all' }, rank)).toEqual({
      filters: { chains: [], labelSource: 'all' },
      labeledAddresses: 0,
      types: [],
      sources: [],
      chains: [],
    });
  });
});
