import { fakeFetch, jsonResponse } from '../../test/support/fake-fetch.js';
import { BlockscoutProvider, labelsFromBlockscoutTags } from './blockscout.provider.js';
import { ProviderError } from './provider.types.js';

const TOKEN = '0x6982508145454Ce325dDbE47a25d4ec3d2311933';

function setup(config: { baseUrl: string; apiKey: string | null }, ...replies: Response[]) {
  const fake = fakeFetch(replies);
  return { fake, blockscout: new BlockscoutProvider(config, fake.http) };
}

const instance = { baseUrl: 'https://eth.blockscout.com', apiKey: null };

describe('BlockscoutProvider', () => {
  it('membaca info kontrak: verifikasi, pembuat, dan tx pembuatan', async () => {
    const { fake, blockscout } = setup(
      instance,
      jsonResponse({
        hash: TOKEN,
        is_contract: true,
        is_verified: true,
        name: 'PepeToken',
        creator_address_hash: '0xfbfEaF0DA0F2fdE5c66dF570133aE35f3eB58c9A',
        creation_transaction_hash: '0x2afae7763487e60b893cb57803694810e6d3d136186a6de6719921afd7ca304a',
      }),
    );
    await expect(blockscout.getContract(TOKEN)).resolves.toEqual({
      isContract: true,
      verified: true,
      contractName: 'PepeToken',
      creatorAddress: '0xfbfEaF0DA0F2fdE5c66dF570133aE35f3eB58c9A',
      creationTxHash: '0x2afae7763487e60b893cb57803694810e6d3d136186a6de6719921afd7ca304a',
    });
    expect(fake.requests[0].url).toBe(`https://eth.blockscout.com/api/v2/addresses/${TOKEN}`);
    expect(fake.requests[0].headers.authorization).toBeUndefined();
  });

  it('memahami nama field Blockscout versi lama', async () => {
    const { blockscout } = setup(instance, jsonResponse({ is_contract: true, creation_tx_hash: '0xabc' }));
    await expect(blockscout.getContract(TOKEN)).resolves.toMatchObject({ verified: null, creationTxHash: '0xabc' });
  });

  it('memakai PRO API dengan API key di header, bukan di URL', async () => {
    const { fake, blockscout } = setup(
      { baseUrl: 'https://api.blockscout.com/4663', apiKey: 'proapi_rahasia' },
      jsonResponse({ type: 'ERC-20', holders_count: '592973' }),
    );
    await expect(blockscout.getTokenInfo(TOKEN)).resolves.toEqual({ type: 'ERC-20', holderCount: 592973 });
    expect(fake.requests[0].url).toBe(`https://api.blockscout.com/4663/api/v2/tokens/${TOKEN}`);
    expect(fake.requests[0].url).not.toContain('proapi_rahasia');
    expect(fake.requests[0].headers.authorization).toBe('Bearer proapi_rahasia');
  });

  it('mengembalikan null bila explorer tidak mengenal address', async () => {
    const { fake, blockscout } = setup(instance, jsonResponse({ message: 'Not found' }, 404));
    await expect(blockscout.getTokenInfo(TOKEN)).resolves.toBeNull();
    expect(fake.requests).toHaveLength(1);
  });

  it('membaca holder teratas beserta label eksternalnya', async () => {
    const { blockscout } = setup(
      instance,
      jsonResponse({
        items: [
          {
            address: {
              hash: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
              is_contract: false,
              metadata: {
                tags: [
                  { tagType: 'name', name: 'Binance: Hot Wallet 20', slug: 'binance-hot-wallet-20' },
                  { tagType: 'generic', name: 'HOT WALLET', slug: 'hot-wallet' },
                  { tagType: 'generic', name: 'Exchange', slug: 'exchange' },
                ],
              },
            },
            value: '25440231359335883197028959490652',
            token_id: null,
          },
          {
            address: { hash: '0x1d48963DD8FAdA6aB5C2C7b92Eba81ECC5030270', is_contract: false, metadata: null },
            value: '14234363437429639835343394313411',
          },
        ],
        next_page_params: { items_count: 50 },
      }),
    );
    await expect(blockscout.getTopHolders(TOKEN)).resolves.toEqual([
      {
        address: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
        isContract: false,
        balanceRaw: '25440231359335883197028959490652',
        labels: [{ type: 'exchange', name: 'Binance: Hot Wallet 20' }],
      },
      {
        address: '0x1d48963DD8FAdA6aB5C2C7b92Eba81ECC5030270',
        isContract: false,
        balanceRaw: '14234363437429639835343394313411',
        labels: [],
      },
    ]);
  });

  it('menolak daftar holder yang formatnya rusak', async () => {
    const { blockscout } = setup(instance, jsonResponse({ items: [{ address: { hash: '0x1' }, value: '-5' }] }));
    await expect(blockscout.getTopHolders(TOKEN)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('labelsFromBlockscoutTags', () => {
  it('memetakan tag generik yang dikenal dan memakai nama protokol bila tidak ada tag nama', () => {
    expect(
      labelsFromBlockscoutTags([
        { tagType: 'protocol', name: 'Uniswap V2', slug: 'uniswap-v2' },
        { tagType: 'generic', name: 'Liquidity Pool', slug: 'liquidity-pool' },
        { tagType: 'generic', name: 'DEX', slug: 'dex' },
        { tagType: 'note', name: 'note_0', slug: 'note0' },
      ]),
    ).toEqual([{ type: 'liquidity_pool', name: 'Uniswap V2' }]);
  });

  it('mengabaikan tag yang tidak dikenal atau data yang bukan daftar', () => {
    expect(labelsFromBlockscoutTags([{ tagType: 'generic', slug: 'meme', name: 'MEME' }])).toEqual([]);
    expect(labelsFromBlockscoutTags(null)).toEqual([]);
  });
});

describe('BlockscoutProvider: riwayat transfer address', () => {
  const ADDRESS = '0x00000000219ab540356cBB839Cbe05303d7705Fa';
  const party = (hash: string) => ({ hash, is_contract: false, metadata: null });
  const tx = (overrides: Record<string, unknown>) => ({
    hash: '0x' + '11'.repeat(32),
    block_number: 26115688,
    timestamp: '2026-10-04T01:25:47.000000Z',
    status: 'ok',
    result: 'success',
    value: '32000000000000000000',
    from: party('0x' + 'aa'.repeat(20)),
    to: party(ADDRESS),
    created_contract: null,
    ...overrides,
  });

  it('mengambil nilai transaksi final dan melewati yang pending, gagal, atau tanpa nilai', async () => {
    const { fake, blockscout } = setup(
      instance,
      jsonResponse({
        items: [
          tx({ hash: '0x' + '01'.repeat(32), block_number: null, timestamp: null, status: null, result: 'pending' }),
          tx({ hash: '0x' + '02'.repeat(32) }),
          tx({ hash: '0x' + '03'.repeat(32), status: 'error', result: 'Reverted' }),
          tx({ hash: '0x' + '04'.repeat(32), value: '0' }),
          tx({ hash: '0x' + '05'.repeat(32), to: null, created_contract: party('0x' + 'cc'.repeat(20)), value: '7' }),
        ],
        next_page_params: { index: 22, value: '32000000000000000000', block_number: 26114702, fee: null, items_count: 50 },
      }),
    );
    const page = await blockscout.getNativeTransfers(ADDRESS, null);
    expect(fake.requests[0].url).toBe(`https://eth.blockscout.com/api/v2/addresses/${ADDRESS}/transactions`);
    expect(page.items.map((item) => [item.txHash.slice(0, 4), item.to, item.amountRaw])).toEqual([
      ['0x02', ADDRESS, '32000000000000000000'],
      ['0x05', '0x' + 'cc'.repeat(20), '7'],
    ]);
    expect(page.items[0]).toMatchObject({ kind: 'transaction', tracePath: '', blockNumber: 26115688, timestamp: new Date('2026-10-04T01:25:47Z') });
    expect(page.skipped).toEqual({ pending: 1, failed: 1, zeroValue: 1 });
    // Transaksi gagal dan tanpa nilai tetap menandai blok yang sudah terbaca; yang pending tidak.
    expect(page.oldestSeen).toEqual({ blockNumber: 26115688, timestamp: new Date('2026-10-04T01:25:47Z') });
    // Nilai kosong di next_page_params dibuang, angka dijadikan teks.
    expect(page.next).toEqual({ index: '22', value: '32000000000000000000', block_number: '26114702', items_count: '50' });
  });

  it('meneruskan cursor halaman berikutnya sebagai query string', async () => {
    const { fake, blockscout } = setup(instance, jsonResponse({ items: [], next_page_params: null }));
    const page = await blockscout.getNativeTransfers(ADDRESS, { block_number: '26114702', index: '22' });
    expect(fake.requests[0].url).toBe(`https://eth.blockscout.com/api/v2/addresses/${ADDRESS}/transactions?block_number=26114702&index=22`);
    expect(page).toEqual({ items: [], next: null, skipped: { pending: 0, failed: 0, zeroValue: 0 }, oldestSeen: null });
  });

  it('mengambil panggilan internal yang memindahkan nilai, dengan posisi trace-nya', async () => {
    const internal = (overrides: Record<string, unknown>) => ({
      block_number: 26115684,
      transaction_hash: '0x' + '21'.repeat(32),
      index: 14,
      type: 'call',
      success: true,
      value: '500',
      timestamp: '2026-10-04T01:24:59.000000Z',
      from: party(ADDRESS),
      to: party('0x' + 'bb'.repeat(20)),
      created_contract: null,
      ...overrides,
    });
    const { fake, blockscout } = setup(
      instance,
      jsonResponse({
        items: [internal({}), internal({ index: 15, type: 'staticcall', value: '0' }), internal({ index: 16, success: false })],
        next_page_params: null,
      }),
    );
    const page = await blockscout.getInternalTransfers(ADDRESS, null);
    expect(fake.requests[0].url).toBe(`https://eth.blockscout.com/api/v2/addresses/${ADDRESS}/internal-transactions`);
    expect(page.items).toEqual([
      {
        txHash: '0x' + '21'.repeat(32),
        kind: 'internal',
        tracePath: '14',
        from: ADDRESS,
        to: '0x' + 'bb'.repeat(20),
        amountRaw: '500',
        blockNumber: 26115684,
        timestamp: new Date('2026-10-04T01:24:59Z'),
      },
    ]);
    expect(page.skipped).toEqual({ pending: 0, failed: 1, zeroValue: 1 });
  });

  it('mengambil transfer token ERC-20 beserta metadata token', async () => {
    const { fake, blockscout } = setup(
      instance,
      jsonResponse({
        items: [
          {
            block_number: 26115683,
            log_index: 543,
            timestamp: '2026-10-04T01:24:47.000000Z',
            transaction_hash: '0x' + '31'.repeat(32),
            token: { address_hash: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: '18', type: 'ERC-20' },
            total: { decimals: '18', value: '1794503010620100' },
            from: party('0x' + 'aa'.repeat(20)),
            to: party(ADDRESS),
            type: 'token_transfer',
          },
        ],
        next_page_params: { index: 1039, block_number: 26115589 },
      }),
    );
    const page = await blockscout.getTokenTransfers(ADDRESS, { index: '1', block_number: '2' });
    expect(fake.requests[0].url).toBe(
      `https://eth.blockscout.com/api/v2/addresses/${ADDRESS}/token-transfers?index=1&block_number=2&type=ERC-20`,
    );
    expect(page.items[0]).toEqual({
      txHash: '0x' + '31'.repeat(32),
      logIndex: 543,
      token: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
      from: '0x' + 'aa'.repeat(20),
      to: ADDRESS,
      amountRaw: '1794503010620100',
      blockNumber: 26115683,
      timestamp: new Date('2026-10-04T01:24:47Z'),
    });
    expect(page.next).toEqual({ index: '1039', block_number: '26115589' });
  });

  it('address yang belum dikenal indexer berarti riwayat kosong, bukan error', async () => {
    const { blockscout } = setup(instance, new Response('{"message":"Not found"}', { status: 404 }));
    await expect(blockscout.getTokenTransfers(ADDRESS, null)).resolves.toEqual({ items: [], next: null });
  });

  it('format yang tidak dikenali ditolak, tidak ditebak', async () => {
    const { blockscout } = setup(
      instance,
      jsonResponse({ items: [tx({ value: 'abc' })], next_page_params: null }),
      jsonResponse({ items: 'bukan daftar' }),
    );
    await expect(blockscout.getNativeTransfers(ADDRESS, null)).rejects.toThrow(ProviderError);
    await expect(blockscout.getInternalTransfers(ADDRESS, null)).rejects.toThrow(/Format daftar transaksi internal/);
  });
});
