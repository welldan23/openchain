import { fakeFetch, rpcError, rpcResult, type Reply } from '../../test/support/fake-fetch.js';
import { EvmJsonRpcProvider, JsonRpcError, READ_ONLY_RPC_METHODS, ReadOnlyViolationError } from './evm-rpc.provider.js';
import { ProviderError, RpcRevertError } from './provider.types.js';

const TOKEN = '0x6982508145454ce325ddbe47a25d4ec3d2311933';

function setup(...replies: Reply[]) {
  const fake = fakeFetch(replies);
  const rpc = new EvmJsonRpcProvider('robinhood-rpc', 'https://rpc.contoh.test/KUNCI', fake.http);
  return { fake, rpc };
}

describe('EvmJsonRpcProvider', () => {
  it.each([
    'eth_sendRawTransaction',
    'eth_sendTransaction',
    'eth_signTransaction',
    'eth_sign',
    'personal_sign',
    'eth_signTypedData_v4',
    'eth_accounts',
    'eth_requestAccounts',
    'wallet_switchEthereumChain',
    'debug_setHead',
  ])('menolak %s sebelum ada request jaringan', async (method) => {
    const { fake, rpc } = setup();
    await expect(rpc.request(method, [])).rejects.toBeInstanceOf(ReadOnlyViolationError);
    expect(fake.requests).toHaveLength(0);
  });

  it('daftar izin hanya berisi method baca', () => {
    for (const method of READ_ONLY_RPC_METHODS) {
      expect(method).toMatch(/^(eth_(chainId|blockNumber|get\w+|call)|debug_traceTransaction)$/);
    }
  });

  it('mengirim request JSON-RPC 2.0 dan membaca angka hex', async () => {
    const { fake, rpc } = setup(rpcResult('0x1237'), rpcResult('0x4b3dc25'));
    await expect(rpc.chainId()).resolves.toBe(4663);
    await expect(rpc.blockNumber()).resolves.toBe(78896165);
    expect(fake.requests[0]).toMatchObject({
      method: 'POST',
      url: 'https://rpc.contoh.test/KUNCI',
      body: { jsonrpc: '2.0', method: 'eth_chainId', params: [] },
    });
    expect(fake.requests[1].body).toMatchObject({ method: 'eth_blockNumber' });
  });

  it('membaca blok beserta waktu dan hash transaksinya', async () => {
    const { fake, rpc } = setup(
      rpcResult({ number: '0x10', hash: '0xabc', timestamp: '0x6720b0c0', transactions: ['0x01', '0x02'] }),
    );
    const block = await rpc.getBlock(16);
    expect(block).toEqual({
      number: 16,
      hash: '0xabc',
      timestamp: new Date(0x6720b0c0 * 1000),
      transactionHashes: ['0x01', '0x02'],
    });
    expect(fake.requests[0].body).toMatchObject({ method: 'eth_getBlockByNumber', params: ['0x10', false] });
  });

  it('memanggil eth_call pada blok yang dipatok', async () => {
    const { fake, rpc } = setup(rpcResult('0x0000000000000000000000000000000000000000000000000000000000000012'));
    await expect(rpc.call({ to: TOKEN, data: '0x313ce567' }, 100)).resolves.toMatch(/12$/);
    expect(fake.requests[0].body).toMatchObject({
      method: 'eth_call',
      params: [{ to: TOKEN, data: '0x313ce567' }, '0x64'],
    });
  });

  it('membedakan revert kontrak dari error RPC lain', async () => {
    const { rpc } = setup(
      rpcError(3, 'execution reverted'),
      rpcError(-32000, 'execution reverted: Ownable: caller is not the owner'),
      rpcError(-32000, 'missing trie node abc (path ) state is not available, see https://rpc.contoh.test/docs'),
    );
    await expect(rpc.call({ to: TOKEN, data: '0x8da5cb5b' }, 1)).rejects.toBeInstanceOf(RpcRevertError);
    await expect(rpc.call({ to: TOKEN, data: '0x8da5cb5b' }, 1)).rejects.toBeInstanceOf(RpcRevertError);
    const error = (await rpc.call({ to: TOKEN, data: '0x8da5cb5b' }, 1).catch((caught: unknown) => caught)) as JsonRpcError;
    expect(error).toBeInstanceOf(JsonRpcError);
    expect(error.code).toBe(-32000);
    expect(error.reason).toBe('eth_call gagal: missing trie node abc (path ) state is not available, see [url] (kode -32000)');
  });

  it('membaca receipt, termasuk kontrak yang dibuat langsung', async () => {
    const { rpc } = setup(
      rpcResult({
        transactionHash: '0xdeploy',
        blockNumber: '0x5',
        from: '0xfbfeaf0da0f2fde5c66df570133ae35f3eb58c9a',
        to: null,
        contractAddress: TOKEN,
        status: '0x1',
        logs: [
          { address: TOKEN, topics: ['0xddf2'], data: '0x', blockNumber: '0x5', transactionHash: '0xdeploy', logIndex: '0x0' },
        ],
      }),
      rpcResult(null),
    );
    await expect(rpc.getTransactionReceipt('0xdeploy')).resolves.toMatchObject({
      blockNumber: 5,
      contractAddress: TOKEN,
      status: 'success',
      to: null,
      logs: [{ logIndex: 0, blockNumber: 5 }],
    });
    await expect(rpc.getTransactionReceipt('0xtidakada')).resolves.toBeNull();
  });

  it('mengirim filter eth_getLogs dalam hex', async () => {
    const { fake, rpc } = setup(rpcResult([]));
    await rpc.getLogs({ address: TOKEN, topics: ['0xddf2', null], fromBlock: 10, toBlock: 20 });
    expect(fake.requests[0].body).toMatchObject({
      method: 'eth_getLogs',
      params: [{ address: TOKEN, topics: ['0xddf2', null], fromBlock: '0xa', toBlock: '0x14' }],
    });
  });

  it('menolak respons dengan format yang tidak dikenali', async () => {
    const { rpc } = setup(rpcResult('bukan-hex'), rpcResult({ number: '0x1' }));
    await expect(rpc.blockNumber()).rejects.toMatchObject({ reason: 'eth_blockNumber: format respons tidak dikenali' });
    await expect(rpc.getBlock('latest')).rejects.toBeInstanceOf(ProviderError);
  });
});
