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
