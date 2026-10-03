/**
 * RPCProvider yang memakai beberapa endpoint RPC untuk satu chain. Setiap
 * panggilan mencoba endpoint sesuai urutan, dan pindah ke endpoint berikutnya
 * bila endpoint itu gagal (batas rate, method ditolak, butuh token arsip,
 * timeout). RPC publik gratis jarang melayani semua method sendirian, jadi
 * gabungan beberapa endpoint menutup kekurangan masing-masing.
 *
 * Revert kontrak tidak memicu perpindahan: itu jawaban sah dari chain, dan
 * endpoint lain akan memberi jawaban yang sama.
 */
import {
  ProviderError,
  RpcRevertError,
  type BlockTag,
  type EvmBlock,
  type EvmLog,
  type EvmLogFilter,
  type EvmReceipt,
  type EvmTransaction,
  type RpcProvider,
} from './provider.types.js';

export class FallbackRpcProvider implements RpcProvider {
  /**
   * @param name nama provider untuk run dan pesan error, mis. `bsc-rpc`.
   * @param endpoints endpoint sesuai prioritas; minimal satu.
   */
  constructor(
    readonly name: string,
    private readonly endpoints: readonly RpcProvider[],
  ) {
    if (endpoints.length === 0) throw new Error('FallbackRpcProvider butuh minimal satu endpoint RPC.');
  }

  /** Jumlah endpoint yang dipakai. */
  get size(): number {
    return this.endpoints.length;
  }

  /**
   * Chain ID ditanyakan ke semua endpoint. Endpoint yang menjawab wajib
   * sepakat, supaya salah ketik URL ke chain lain langsung ketahuan.
   */
  async chainId(): Promise<number> {
    const results = await Promise.allSettled(this.endpoints.map((endpoint) => endpoint.chainId()));
    const ids = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    if (ids.length === 0) {
      throw new ProviderError(this.name, `Semua RPC gagal: ${this.describeFailures(results)}`);
    }
    const distinct = [...new Set(ids)];
    if (distinct.length > 1) {
      const detail = results
        .map((result, index) => `RPC ${index + 1}: ${result.status === 'fulfilled' ? result.value : 'gagal'}`)
        .join(', ');
      throw new ProviderError(this.name, `Endpoint RPC tidak sepakat chain ID (${detail})`);
    }
    return distinct[0];
  }

  blockNumber(): Promise<number> {
    return this.first((endpoint) => endpoint.blockNumber());
  }

  getBlock(block: BlockTag): Promise<EvmBlock | null> {
    return this.first((endpoint) => endpoint.getBlock(block));
  }

  getTransaction(hash: string): Promise<EvmTransaction | null> {
    return this.first((endpoint) => endpoint.getTransaction(hash));
  }

  getTransactionReceipt(hash: string): Promise<EvmReceipt | null> {
    return this.first((endpoint) => endpoint.getTransactionReceipt(hash));
  }

  getLogs(filter: EvmLogFilter): Promise<EvmLog[]> {
    return this.first((endpoint) => endpoint.getLogs(filter));
  }

  call(request: { to: string; data: string }, block: BlockTag): Promise<string> {
    return this.first((endpoint) => endpoint.call(request, block));
  }

  getCode(address: string, block: BlockTag): Promise<string> {
    return this.first((endpoint) => endpoint.getCode(address, block));
  }

  getStorageAt(address: string, slot: string, block: BlockTag): Promise<string> {
    return this.first((endpoint) => endpoint.getStorageAt(address, slot, block));
  }

  traceTransaction(hash: string): Promise<unknown> {
    return this.first((endpoint) => endpoint.traceTransaction(hash));
  }

  /** Jawaban pertama yang berhasil; endpoint yang gagal dilewati. */
  private async first<T>(run: (endpoint: RpcProvider) => Promise<T>): Promise<T> {
    const failures: PromiseSettledResult<T>[] = [];
    for (const endpoint of this.endpoints) {
      try {
        return await run(endpoint);
      } catch (error) {
        if (error instanceof RpcRevertError || !(error instanceof ProviderError)) throw error;
        failures.push({ status: 'rejected', reason: error });
      }
    }
    if (this.endpoints.length === 1) throw (failures[0] as PromiseRejectedResult).reason;
    throw new ProviderError(this.name, `Semua RPC gagal: ${this.describeFailures(failures)}`);
  }

  private describeFailures(results: PromiseSettledResult<unknown>[]): string {
    return results
      .map((result, index) => {
        if (result.status === 'fulfilled') return null;
        const reason = result.reason instanceof ProviderError ? result.reason.reason : 'kesalahan tidak dikenal';
        return `RPC ${index + 1}: ${reason}`;
      })
      .filter(Boolean)
      .join('; ')
      .slice(0, 500);
  }
}
