import { fakeFetch, jsonResponse } from '../../test/support/fake-fetch.js';
import { DexscreenerProvider, summarizePairs } from './dexscreener.provider.js';

const TOKEN = '0x008Df4b3E857D06c4603Aeb11F267ccD32ce2005';

function pair(overrides: Record<string, unknown>) {
  return {
    chainId: 'robinhood',
    dexId: 'uniswap',
    baseToken: { address: TOKEN, symbol: 'ROBINHOOD' },
    quoteToken: { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH' },
    priceUsd: '0.001519',
    txns: { h24: { buys: 234, sells: 149 } },
    volume: { h24: 79649.31 },
    priceChange: { h24: -17.49 },
    liquidity: { usd: 118130.6 },
    fdv: 1519103,
    marketCap: 1519103,
    ...overrides,
  };
}

const isToken = (address: string) => address.toLowerCase() === TOKEN.toLowerCase();

describe('summarizePairs', () => {
  it('memakai pair paling likuid untuk harga dan menjumlahkan likuiditas, volume, dan transaksi', () => {
    const result = summarizePairs(
      [
        pair({}),
        pair({ priceUsd: '0.0016', liquidity: { usd: 900.4 }, volume: { h24: 50 }, txns: { h24: { buys: 1, sells: 2 } }, marketCap: 1 }),
        // Token ini menjadi quote, jadi harganya bukan harga token ini.
        pair({ baseToken: { address: '0xbf5dEBF673FEaF2F06f22829AcE9Bbd49b134584' }, quoteToken: { address: TOKEN }, liquidity: { usd: 1e9 } }),
      ],
      isToken,
    );
    expect(result).toEqual({
      poolCount: 3,
      pairCount: 2,
      priceUsd: '0.001519',
      priceChange24hPct: '-17.49',
      marketCapUsd: '1519103',
      fdvUsd: '1519103',
      liquidityUsd: '119031',
      volume24hUsd: '79699.31',
      txCount24h: 386,
      missingFields: [],
    });
  });

  it('mengembalikan pairCount 0 bila token tidak punya pair', () => {
    expect(summarizePairs([], isToken)).toMatchObject({ poolCount: 0, pairCount: 0, priceUsd: null, missingFields: [] });
  });

  it('membedakan token yang hanya menjadi quote dari token tanpa pool', () => {
    const quoteOnly = pair({ baseToken: { address: '0x9b498C3c8A0b8CD8BA1D9851d40D186F1872b44E' }, quoteToken: { address: TOKEN } });
    expect(summarizePairs([quoteOnly], isToken)).toMatchObject({ poolCount: 1, pairCount: 0, priceUsd: null });
  });

  it('tidak menyimpan angka yang tidak ada atau di luar jangkauan kolom', () => {
    const result = summarizePairs(
      [pair({ priceUsd: '0.0000000000000000001', priceChange: { h24: 250_000_000 }, fdv: undefined, txns: {} })],
      isToken,
    );
    expect(result.priceUsd).toBeNull();
    expect(result.priceChange24hPct).toBeNull();
    expect(result.missingFields).toEqual(['market.priceUsd', 'market.priceChange24hPct', 'market.fdvUsd', 'market.txCount24h']);
  });
});

describe('DexscreenerProvider', () => {
  it('meminta semua pool token di chain yang benar dan mencocokkan address EVM tanpa peduli huruf besar-kecil', async () => {
    const fake = fakeFetch([jsonResponse([pair({ baseToken: { address: TOKEN.toLowerCase() } })])]);
    const provider = new DexscreenerProvider('robinhood', 'evm', fake.http);
    await expect(provider.getTokenMarket(TOKEN)).resolves.toMatchObject({ poolCount: 1, pairCount: 1, priceUsd: '0.001519' });
    expect(fake.requests[0].url).toBe(`https://api.dexscreener.com/token-pairs/v1/robinhood/${TOKEN}`);
  });

  it('menolak respons yang bukan daftar pair', async () => {
    const fake = fakeFetch([jsonResponse({ pairs: null })]);
    const provider = new DexscreenerProvider('robinhood', 'evm', fake.http);
    await expect(provider.getTokenMarket(TOKEN)).rejects.toMatchObject({ reason: 'Format daftar pair tidak dikenali' });
  });
});
