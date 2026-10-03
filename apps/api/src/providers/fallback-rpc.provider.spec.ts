import { FallbackRpcProvider } from './fallback-rpc.provider.js';
import { ProviderError, RpcRevertError, type RpcProvider } from './provider.types.js';

type Behaviour = Partial<Record<keyof RpcProvider, unknown>>;

/** Endpoint palsu: nilai biasa dikembalikan, Error dilempar. */
function endpoint(name: string, behaviour: Behaviour): RpcProvider & { calls: string[] } {
  const calls: string[] = [];
  const handler = (method: string) => async () => {
    calls.push(method);
    const value = behaviour[method as keyof RpcProvider];
    if (value instanceof Error) throw value;
    if (value === undefined) throw new ProviderError(name, `${method} tidak didukung`);
    return value;
  };
  const methods = ['chainId', 'blockNumber', 'getBlock', 'getTransaction', 'getTransactionReceipt', 'getLogs', 'call', 'getCode', 'getStorageAt', 'traceTransaction'];
  return Object.assign(Object.fromEntries(methods.map((method) => [method, handler(method)])), { name, calls }) as never;
}

describe('FallbackRpcProvider', () => {
  it('memakai endpoint pertama yang berhasil', async () => {
    const satu = endpoint('rpc-1', { blockNumber: 100 });
    const dua = endpoint('rpc-2', { blockNumber: 101 });
    await expect(new FallbackRpcProvider('bsc-rpc', [satu, dua]).blockNumber()).resolves.toBe(100);
    expect(dua.calls).toEqual([]);
  });

  it('pindah ke endpoint berikutnya bila method ditolak', async () => {
    const resmi = endpoint('rpc-1', { getLogs: new ProviderError('rpc-1', 'eth_getLogs gagal: limit exceeded (kode -32005)') });
    const cadangan = endpoint('rpc-2', { getLogs: [] });
    await expect(new FallbackRpcProvider('bsc-rpc', [resmi, cadangan]).getLogs({ fromBlock: 1, toBlock: 2 })).resolves.toEqual([]);
    expect(resmi.calls).toEqual(['getLogs']);
    expect(cadangan.calls).toEqual(['getLogs']);
  });

  it('revert kontrak langsung diteruskan tanpa mencoba endpoint lain', async () => {
    const satu = endpoint('rpc-1', { call: new RpcRevertError('rpc-1') });
    const dua = endpoint('rpc-2', { call: '0x01' });
    await expect(new FallbackRpcProvider('bsc-rpc', [satu, dua]).call({ to: '0x1', data: '0x' }, 1)).rejects.toBeInstanceOf(RpcRevertError);
    expect(dua.calls).toEqual([]);
  });

  it('melaporkan alasan setiap endpoint bila semua gagal', async () => {
    const satu = endpoint('rpc-1', { getTransactionReceipt: new ProviderError('rpc-1', 'HTTP 429: kena batas rate provider') });
    const dua = endpoint('rpc-2', { getTransactionReceipt: new ProviderError('rpc-2', 'HTTP 403: akses ditolak (Archive requests require a personal token)') });
    await expect(new FallbackRpcProvider('bsc-rpc', [satu, dua]).getTransactionReceipt('0xab')).rejects.toMatchObject({
      provider: 'bsc-rpc',
      reason:
        'Semua RPC gagal: RPC 1: HTTP 429: kena batas rate provider; RPC 2: HTTP 403: akses ditolak (Archive requests require a personal token)',
    });
  });

  it('mengecek chain ID ke semua endpoint dan menolak bila tidak sepakat', async () => {
    const benar = endpoint('rpc-1', { chainId: 56 });
    const mati = endpoint('rpc-2', { chainId: new ProviderError('rpc-2', 'Koneksi gagal') });
    await expect(new FallbackRpcProvider('bsc-rpc', [benar, mati]).chainId()).resolves.toBe(56);

    const salah = endpoint('rpc-3', { chainId: 1 });
    await expect(new FallbackRpcProvider('bsc-rpc', [benar, salah]).chainId()).rejects.toMatchObject({
      reason: 'Endpoint RPC tidak sepakat chain ID (RPC 1: 56, RPC 2: 1)',
    });
  });

  it('bug di kode tidak disembunyikan sebagai kegagalan RPC', async () => {
    const rusak = endpoint('rpc-1', { getCode: new TypeError('bug') });
    const dua = endpoint('rpc-2', { getCode: '0x60' });
    await expect(new FallbackRpcProvider('bsc-rpc', [rusak, dua]).getCode('0x1', 1)).rejects.toBeInstanceOf(TypeError);
  });

  it('mencoba endpoint lain bila receipt kosong, karena node bisa sudah memangkas riwayat', async () => {
    const dipangkas = endpoint('rpc-1', { getTransactionReceipt: null });
    const lengkap = endpoint('rpc-2', { getTransactionReceipt: { transactionHash: '0xab' } });
    await expect(new FallbackRpcProvider('eth-rpc', [dipangkas, lengkap]).getTransactionReceipt('0xab')).resolves.toEqual({
      transactionHash: '0xab',
    });
  });

  it('mengembalikan null bila semua endpoint yang menjawab bilang kosong', async () => {
    const kosong = endpoint('rpc-1', { getTransaction: null });
    const mati = endpoint('rpc-2', { getTransaction: new ProviderError('rpc-2', 'Koneksi gagal') });
    await expect(new FallbackRpcProvider('eth-rpc', [kosong, mati]).getTransaction('0xab')).resolves.toBeNull();
  });
});
