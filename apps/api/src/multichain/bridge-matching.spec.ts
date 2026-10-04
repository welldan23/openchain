import { assetKey, matchBridgeSends, protocolFromLabel, type BridgeReceipt, type BridgeSend } from './bridge-matching.js';

const T0 = Date.UTC(2026, 9, 1, 8, 0, 0);
const minutes = (value: number) => new Date(T0 + value * 60_000);
const ETH = 'native:ETH';
const send = (key: string, amountRaw: string, at = 0, chainId = 'base', asset = ETH): BridgeSend => ({ key, chainId, asset, amountRaw, sentAt: minutes(at) });
const receipt = (key: string, amountRaw: string, at: number, chainId = 'ethereum', asset = ETH): BridgeReceipt => ({ key, chainId, asset, amountRaw, receivedAt: minutes(at) });

describe('matchBridgeSends', () => {
  it('mencocokkan penerimaan aset sama di chain lain dengan selisih kecil dan cepat sebagai keyakinan tinggi', () => {
    const [decision] = matchBridgeSends([send('s1', '1000000')], [receipt('r1', '999000', 10)], null);
    expect(decision).toMatchObject({ status: 'matched', confidence: 'high', receipt: { key: 'r1' } });
    expect(decision.reason).toBe('Penerimaan di ethereum: selisih 0,1%, 10 menit setelah dikirim.');
  });

  it('keyakinan sedang bila selisih atau jeda lebih besar, rendah bila kandidatnya lebih dari satu', () => {
    expect(matchBridgeSends([send('s1', '1000000')], [receipt('r1', '992000', 300)], null)[0]).toMatchObject({ status: 'matched', confidence: 'medium' });
    const [decision] = matchBridgeSends([send('s1', '1000000')], [receipt('r1', '995000', 30), receipt('r2', '999500', 600)], null);
    expect(decision).toMatchObject({ confidence: 'low', receipt: { key: 'r2' } });
    expect(decision.reason).toContain('ada 2 kandidat');
  });

  it('menolak aset berbeda, chain yang sama, jumlah lebih besar, selisih >1%, atau di luar 24 jam', () => {
    const receipts = [
      receipt('asset', '1000000', 5, 'ethereum', 'native:BNB'),
      receipt('same-chain', '1000000', 5, 'base'),
      receipt('more', '1000001', 5),
      receipt('fee', '989000', 5),
      receipt('before', '1000000', -1),
      receipt('late', '1000000', 24 * 60 + 1),
    ];
    expect(matchBridgeSends([send('s1', '1000000')], receipts, null)[0]).toMatchObject({ status: 'pending', receipt: null, confidence: null });
  });

  it('satu penerimaan hanya untuk satu kiriman; kiriman lama tanpa pasangan disebut tidak cocok', () => {
    const decisions = matchBridgeSends([send('s1', '1000000', 0), send('s2', '1000000', 5)], [receipt('r1', '1000000', 20)], minutes(3 * 24 * 60));
    expect(decisions.map((item) => [item.sendKey, item.status, item.receipt?.key ?? null])).toEqual([
      ['s1', 'matched', 'r1'],
      ['s2', 'unmatched', null],
    ]);
    expect(decisions[1].reason).toContain('Tidak ada penerimaan');
    expect(matchBridgeSends([send('s3', '5')], [], minutes(60))[0].status).toBe('pending');
  });
});

describe('assetKey dan protocolFromLabel', () => {
  it('membandingkan native per simbol dan token per simbol dan desimal', () => {
    expect(assetKey({ type: 'native', symbol: 'eth' })).toBe('native:ETH');
    expect(assetKey({ type: 'token', symbol: 'usdc', decimals: 6 })).toBe('token:USDC:6');
    expect(assetKey({ type: 'token', symbol: null, decimals: 6 })).toBeNull();
  });

  it('mengambil nama protokol dari nama label', () => {
    expect(protocolFromLabel('Across Protocol: Spoke Pool')).toEqual({ id: 'across-protocol', name: 'Across Protocol' });
    expect(protocolFromLabel('Uniswap V3: Router 2')).toEqual({ id: 'uniswap-v3', name: 'Uniswap V3' });
    expect(protocolFromLabel(null)).toBeNull();
    expect(protocolFromLabel(':::')).toBeNull();
  });
});
