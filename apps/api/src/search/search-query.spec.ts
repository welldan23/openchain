import { applyFilters, classifyQuery, dedupeResults, searchFacets, textTsQuery } from './search-query.js';
import type { SearchFilters, SearchResultView } from './search.types.js';

const result = (id: string, kind: SearchResultView['kind'], chains: string[], label: SearchResultView['label'] = null, href = `/${id}`): SearchResultView => ({
  id,
  kind,
  title: id,
  subtitle: null,
  chain: chains.length === 1 ? chains[0] : null,
  chains,
  label,
  href,
  matchedBy: '',
  meta: null,
});
const external = { type: 'exchange', name: 'Bybit', source: 'external' as const, sourceName: 'Blockscout', classification: 'external_label' as const, confidence: null };
const heuristic = { type: 'whale', name: null, source: 'heuristic' as const, sourceName: 'OpenChain heuristic', classification: 'heuristic' as const, confidence: 0.6 };
const none: SearchFilters = { kind: 'all', chains: [], labels: [], labelSource: 'all' };

describe('kueri pencarian', () => {
  it('mengenali bentuk input seperti di frontend', () => {
    expect(classifyQuery('  ')).toBe('empty');
    expect(classifyQuery('0x' + 'a'.repeat(40))).toBe('evm_address');
    expect(classifyQuery('0x' + 'a'.repeat(64))).toBe('evm_tx');
    expect(classifyQuery('So11111111111111111111111111111111111111112')).toBe('solana_address');
    expect(classifyQuery('5'.repeat(88))).toBe('solana_tx');
    expect(classifyQuery('nebula')).toBe('text');
  });

  it('menyusun tsquery awalan kata tanpa meloloskan karakter khusus', () => {
    expect(textTsQuery('Nebula  Fin')).toBe('nebula:* & fin:*');
    expect(textTsQuery("bybit: hot' | ! (wallet)")).toBe('bybit:* & hot:* & wallet:*');
    expect(textTsQuery('a')).toBeNull();
    expect(textTsQuery('!!')).toBeNull();
  });
});

describe('filter dan facet hasil', () => {
  const results = [
    result('tok', 'token', ['ethereum']),
    result('bybit', 'address', ['base'], external),
    result('whale', 'address', ['base'], heuristic),
    result('multi', 'address', ['ethereum', 'base']),
    result('tx', 'transaction', ['ethereum']),
  ];

  it('menyaring jenis, jaringan, label, dan sumber label; tanpa label tersaring saat sumber dipilih', () => {
    expect(applyFilters(results, { ...none, kind: 'address' }).map((item) => item.id)).toEqual(['bybit', 'whale', 'multi']);
    expect(applyFilters(results, { ...none, chains: ['ethereum'] }).map((item) => item.id)).toEqual(['tok', 'multi', 'tx']);
    expect(applyFilters(results, { ...none, labels: ['none'] }).map((item) => item.id)).toEqual(['tok', 'multi', 'tx']);
    expect(applyFilters(results, { ...none, labelSource: 'external' }).map((item) => item.id)).toEqual(['bybit']);
  });

  it('menghitung jumlah tiap pilihan dengan filter dimensi lain tetap berlaku', () => {
    const facets = searchFacets(results, { ...none, kind: 'address' }, ['ethereum', 'base']);
    expect(facets.kinds).toEqual({ all: 5, token: 1, address: 3, transaction: 1 });
    expect(facets.chains).toEqual([
      { chain: 'ethereum', count: 1 },
      { chain: 'base', count: 3 },
    ]);
    expect(facets.labels).toEqual([
      { key: 'exchange', count: 1 },
      { key: 'whale', count: 1 },
      { key: 'none', count: 1 },
    ]);
    expect(facets.sources).toEqual({ all: 3, external: 1, heuristic: 1 });
  });

  it('membuang duplikat per href dan mengurutkan token, address, transaksi', () => {
    const items = [result('tx', 'transaction', ['ethereum']), result('a', 'address', ['base']), result('a2', 'address', ['base'], null, '/a'), result('t', 'token', ['base'])];
    expect(dedupeResults(items).map((item) => item.id)).toEqual(['t', 'a', 'tx']);
  });
});
