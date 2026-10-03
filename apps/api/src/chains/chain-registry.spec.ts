import { fakeFetch, jsonResponse } from '../../test/support/fake-fetch.js';
import { ChainNotSupportedError, ChainRegistry } from './chain-registry.js';

const SECRET_RPC = 'https://rpc.contoh.test/v2/KUNCI-RPC-RAHASIA';
const SECRET_KEY = 'proapi_KUNCI-RAHASIA';

describe('ChainRegistry', () => {
  it('mengenal 8 chain EVM dengan Robinhood Chain sebagai prioritas pertama', () => {
    expect(new ChainRegistry({}).chainIds()).toEqual([
      'robinhood',
      'ethereum',
      'base',
      'bsc',
      'arbitrum',
      'optimism',
      'polygon',
      'hyperevm',
    ]);
  });

  it('menolak chain yang belum punya adapter dengan alasan yang jelas', () => {
    const registry = new ChainRegistry({});
    expect(() => registry.adapter('solana')).toThrow(ChainNotSupportedError);
    expect(() => registry.adapter('solana')).toThrow('dijadwalkan di fase 4');
    expect(() => registry.adapter('dogechain')).toThrow('Chain "dogechain" tidak dikenal. Pilihan: robinhood, ethereum');
  });

  it('memakai RPC dari env dan Blockscout PRO API dengan API key di header', async () => {
    // Semua request dijawab 404 supaya smoke test selesai cepat; yang dicek URL-nya.
    const fake = fakeFetch([], () => jsonResponse({ message: 'Not found' }, 404));
    const registry = new ChainRegistry({ RPC_URL_ROBINHOOD: SECRET_RPC, BLOCKSCOUT_API_KEY: SECRET_KEY }, fake.http);
    const report = await registry.adapter('robinhood').smokeTest();

    expect(report.status).toBe('planned');
    const urls = fake.requests.map((request) => request.url);
    expect(urls).toContain(SECRET_RPC);
    const blockscout = fake.requests.find((request) => request.url.startsWith('https://api.blockscout.com/4663/api/v2/'));
    expect(blockscout?.headers.authorization).toBe(`Bearer ${SECRET_KEY}`);
    expect(urls.some((url) => url.includes(SECRET_KEY))).toBe(false);
    expect(urls).toContain('https://api.dexscreener.com/token-pairs/v1/robinhood/0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73');
    for (const check of report.checks) {
      expect(check.detail).not.toContain('KUNCI');
      expect(check.detail).not.toContain('rpc.contoh.test');
    }
  });

  it('memakai instance Blockscout publik bila tidak ada API key', async () => {
    const fake = fakeFetch([], () => jsonResponse({ message: 'Not found' }, 404));
    await new ChainRegistry({}, fake.http).adapter('ethereum').smokeTest();
    const urls = fake.requests.map((request) => request.url);
    expect(urls).toContain('https://ethereum-rpc.publicnode.com');
    expect(urls.some((url) => url.startsWith('https://eth.blockscout.com/api/v2/'))).toBe(true);
    expect(fake.requests.every((request) => request.headers.authorization === undefined)).toBe(true);
  });

  it('menjelaskan asal konfigurasi tanpa mencetak URL atau API key', () => {
    const registry = new ChainRegistry({ RPC_URL_ROBINHOOD: SECRET_RPC, BLOCKSCOUT_API_KEY: SECRET_KEY });
    expect(registry.describe('robinhood')).toEqual({
      chainId: 'robinhood',
      name: 'Robinhood Chain',
      evmChainId: 4663,
      rpc: 'dari RPC_URL_ROBINHOOD',
      explorer: 'Blockscout PRO API (BLOCKSCOUT_API_KEY)',
      market: 'Dexscreener (robinhood)',
    });
    expect(new ChainRegistry({}).describe('bsc')).toMatchObject({ rpc: 'RPC publik default', explorer: 'tidak ada' });
    expect(new ChainRegistry({ BLOCKSCOUT_URL_BSC: 'https://bsc.contoh.test' }).describe('bsc').explorer).toBe(
      'Blockscout dari BLOCKSCOUT_URL_BSC',
    );
  });
});
