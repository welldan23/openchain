import { fakeFetch, jsonResponse } from '../../test/support/fake-fetch.js';
import { GoPlusProvider } from './goplus.provider.js';
import { HoneypotIsProvider } from './honeypot-is.provider.js';

const TOKEN = '0x008df4b3e857d06c4603aeb11f267ccd32ce2005';

describe('GoPlusProvider', () => {
  it('membaca pajak, fungsi berbahaya, honeypot, dan LP yang terkunci', async () => {
    const fake = fakeFetch([
      jsonResponse({
        code: 1,
        message: 'OK',
        result: {
          [TOKEN]: {
            is_honeypot: '0',
            buy_tax: '0.03',
            sell_tax: '0.05',
            transfer_tax: '0',
            slippage_modifiable: '1',
            is_mintable: '0',
            is_blacklisted: '1',
            transfer_pausable: '0',
            lp_holders: [
              { address: '0x000000000000000000000000000000000000dead', percent: '0.6', is_locked: 0, is_contract: 0 },
              { address: '0x1111111111111111111111111111111111111111', percent: '0.2', is_locked: 1, is_contract: 1 },
              { address: '0x2222222222222222222222222222222222222222', percent: '0.15', is_locked: 0, is_contract: 0 },
              { address: '0x3333333333333333333333333333333333333333', percent: '0.05', is_locked: 0, is_contract: 1 },
            ],
          },
        },
      }),
    ]);
    await expect(new GoPlusProvider(4663, fake.http).getTokenSecurity(TOKEN)).resolves.toEqual({
      sourceName: 'GoPlus Security',
      honeypot: false,
      buyTaxPct: '3',
      sellTaxPct: '5',
      transferTaxPct: '0',
      taxModifiable: true,
      mintable: false,
      blacklist: true,
      pausable: false,
      lpLockedPct: '80',
      lpTopWalletPct: '15',
      missingFields: [],
    });
    expect(fake.requests[0].url).toBe(`https://api.gopluslabs.io/api/v1/token_security/4663?contract_addresses=${TOKEN}`);
  });

  it('pajak kosong dan LP tanpa data dicatat sebagai tidak tersedia, bukan 0', async () => {
    const fake = fakeFetch([
      jsonResponse({ code: 1, result: { [TOKEN]: { is_honeypot: '0', buy_tax: '', sell_tax: '', is_mintable: '0', is_blacklisted: '0', transfer_pausable: '0' } } }),
    ]);
    const report = await new GoPlusProvider(1, fake.http).getTokenSecurity(TOKEN);
    expect(report).toMatchObject({ buyTaxPct: null, sellTaxPct: null, lpLockedPct: null });
    expect(report?.missingFields).toEqual(['security.buyTaxPct', 'security.sellTaxPct', 'security.lpLockedPct']);
  });

  it('null bila token belum dikenal, error bila GoPlus menolak', async () => {
    const fake = fakeFetch([jsonResponse({ code: 1, result: {} }), jsonResponse({ code: 4029, message: 'too many requests', result: null })]);
    const goplus = new GoPlusProvider(1, fake.http);
    await expect(goplus.getTokenSecurity(TOKEN)).resolves.toBeNull();
    await expect(goplus.getTokenSecurity(TOKEN)).rejects.toMatchObject({ reason: 'GoPlus menolak permintaan: too many requests (kode 4029)' });
  });
});

describe('HoneypotIsProvider', () => {
  it('membaca hasil simulasi jual dan pajaknya', async () => {
    const fake = fakeFetch([
      jsonResponse({
        simulationSuccess: true,
        honeypotResult: { isHoneypot: false },
        simulationResult: { buyTax: 1.5, sellTax: 2, transferTax: 0 },
      }),
    ]);
    await expect(new HoneypotIsProvider(8453, fake.http).getTokenSecurity(TOKEN)).resolves.toMatchObject({
      sourceName: 'honeypot.is',
      honeypot: false,
      buyTaxPct: '1.5',
      sellTaxPct: '2',
      mintable: null,
      missingFields: [],
    });
    expect(fake.requests[0].url).toBe(`https://api.honeypot.is/v2/IsHoneypot?address=${TOKEN}&chainID=8453`);
  });

  it('simulasi gagal berarti pajak tidak diketahui; 404 berarti token belum dikenal', async () => {
    const fake = fakeFetch([
      jsonResponse({ simulationSuccess: false, honeypotResult: { isHoneypot: true }, simulationResult: { buyTax: 99 } }),
      jsonResponse({ code: 404, error: 'Pair not found' }, 404),
    ]);
    const provider = new HoneypotIsProvider(1, fake.http);
    await expect(provider.getTokenSecurity(TOKEN)).resolves.toMatchObject({ honeypot: true, buyTaxPct: null, sellTaxPct: null });
    await expect(provider.getTokenSecurity(TOKEN)).resolves.toBeNull();
  });
});
