import { fakeFetch, jsonResponse } from '../../test/support/fake-fetch.js';
import { cacheableRpcResponse, CACHE_TTL_MS, rpcCacheTtl } from './cache-policy.js';
import { HttpClient } from './http-client.js';
import { ResponseCache } from './response-cache.js';

describe('ResponseCache', () => {
  it('menyimpan sampai TTL habis dan menghitung hit/miss', () => {
    let now = 1_000;
    const cache = new ResponseCache(10, () => now);
    cache.set('a', { n: 1 }, 500);
    expect(cache.get('a')).toEqual({ n: 1 });
    now += 600;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.stats()).toEqual({ hits: 1, misses: 1, entries: 0 });
    cache.set('b', 1, 0);
    expect(cache.get('b')).toBeUndefined();
  });

  it('membuang entri yang paling lama tidak dipakai saat penuh', () => {
    const cache = new ResponseCache(2);
    cache.set('a', 1, 1_000);
    cache.set('b', 2, 1_000);
    cache.get('a');
    cache.set('c', 3, 1_000);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  it('mengembalikan salinan supaya data tersimpan tidak ikut berubah', () => {
    const cache = new ResponseCache();
    const value = { list: [1] };
    cache.set('a', value, 1_000);
    value.list.push(2);
    const first = cache.get<{ list: number[] }>('a')!;
    first.list.push(3);
    expect(cache.get('a')).toEqual({ list: [1] });
  });
});

describe('HttpClient dengan cache', () => {
  const withCache = (responses: Response[]) => {
    const fake = fakeFetch(responses);
    const cache = new ResponseCache();
    return { fake, cache, http: new HttpClient(fake.fetchImpl, async () => {}, cache) };
  };

  it('permintaan kedua dengan kunci sama dilayani dari cache', async () => {
    const { fake, http, cache } = withCache([jsonResponse({ ok: 1 }), jsonResponse({ ok: 2 })]);
    const request = { provider: 'contoh', url: 'https://api.contoh.test/a', cacheTtlMs: 1_000, cacheKey: 'a' };
    await expect(http.requestJson(request)).resolves.toEqual({ ok: 1 });
    await expect(http.requestJson(request)).resolves.toEqual({ ok: 1 });
    expect(fake.requests).toHaveLength(1);
    expect(cache.stats()).toMatchObject({ hits: 1, entries: 1 });
  });

  it('tanpa kunci atau TTL, gagal, atau ditolak predikat: tidak disimpan', async () => {
    const { fake, http } = withCache([
      jsonResponse({ ok: 1 }),
      jsonResponse({ ok: 2 }),
      jsonResponse({ result: null }),
      jsonResponse({ result: null }),
      jsonResponse({}, 404),
      jsonResponse({ ok: 3 }),
    ]);
    const plain = { provider: 'contoh', url: 'https://api.contoh.test/b' };
    await http.requestJson(plain);
    await http.requestJson(plain);
    const rejected = { ...plain, cacheTtlMs: 1_000, cacheKey: 'c', cacheable: cacheableRpcResponse };
    await http.requestJson(rejected);
    await http.requestJson(rejected);
    const failing = { ...plain, cacheTtlMs: 1_000, cacheKey: 'd' };
    await expect(http.requestJson(failing)).rejects.toMatchObject({ status: 404 });
    await expect(http.requestJson(failing)).resolves.toEqual({ ok: 3 });
    expect(fake.requests).toHaveLength(6);
  });
});

describe('kebijakan cache RPC', () => {
  it('hanya data pada blok atau hash tertentu yang disimpan, bukan yang terbaru', () => {
    expect(rpcCacheTtl('eth_chainId', [])).toBe(CACHE_TTL_MS.chainId);
    expect(rpcCacheTtl('eth_getTransactionReceipt', ['0xab'])).toBe(CACHE_TTL_MS.immutable);
    expect(rpcCacheTtl('eth_getBlockByNumber', ['0x10', false])).toBe(CACHE_TTL_MS.immutable);
    expect(rpcCacheTtl('eth_getBlockByNumber', ['latest', false])).toBe(0);
    expect(rpcCacheTtl('eth_call', [{ to: '0x1', data: '0x' }, '0x10'])).toBe(CACHE_TTL_MS.immutable);
    expect(rpcCacheTtl('eth_call', [{ to: '0x1', data: '0x' }, 'latest'])).toBe(0);
    expect(rpcCacheTtl('eth_getLogs', [{ fromBlock: '0x1', toBlock: '0x2' }])).toBe(CACHE_TTL_MS.immutable);
    expect(rpcCacheTtl('eth_getLogs', [{ fromBlock: '0x1', toBlock: 'latest' }])).toBe(0);
    expect(rpcCacheTtl('eth_blockNumber', [])).toBe(0);
  });

  it('respons RPC yang gagal atau kosong tidak disimpan', () => {
    expect(cacheableRpcResponse({ result: '0x1' })).toBe(true);
    expect(cacheableRpcResponse({ result: null })).toBe(false);
    expect(cacheableRpcResponse({ error: { code: -32000 } })).toBe(false);
    expect(cacheableRpcResponse([])).toBe(false);
  });
});
