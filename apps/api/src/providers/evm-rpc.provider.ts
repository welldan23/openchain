/**
 * RPCProvider untuk chain EVM lewat JSON-RPC, khusus baca.
 *
 * Hanya method di `READ_ONLY_RPC_METHODS` yang boleh dipanggil. Method penulis
 * seperti `eth_sendRawTransaction`, `eth_sign`, atau `eth_accounts` ditolak
 * sebelum ada request jaringan, jadi tidak ada jalur signing atau pengiriman
 * transaksi di aplikasi ini.
 */
import { sanitizeProviderText, type HttpClient } from './http-client.js';
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

/** Method JSON-RPC yang diizinkan: semuanya hanya membaca data. */
export const READ_ONLY_RPC_METHODS: ReadonlySet<string> = new Set([
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_getLogs',
  'eth_call',
  'eth_getCode',
  'eth_getStorageAt',
  'debug_traceTransaction',
]);

/** Ada kode yang mencoba memanggil method RPC di luar daftar izin. */
export class ReadOnlyViolationError extends Error {
  constructor(method: string) {
    super(`Method RPC "${method}" tidak diizinkan: OpenChain hanya membaca data.`);
    this.name = 'ReadOnlyViolationError';
  }
}

/** Node RPC membalas dengan objek error JSON-RPC. */
export class JsonRpcError extends ProviderError {
  constructor(
    provider: string,
    readonly code: number | null,
    reason: string,
  ) {
    super(provider, reason);
    this.name = 'JsonRpcError';
  }
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { code?: unknown; message?: unknown };
}

type RawRecord = Record<string, unknown>;

export interface EvmRpcOptions {
  timeoutMs?: number;
  retries?: number;
}

export class EvmJsonRpcProvider implements RpcProvider {
  private nextId = 1;

  /**
   * @param name nama provider yang aman ditampilkan, mis. `robinhood-rpc`.
   * @param url endpoint RPC; bisa berisi API key, jadi tidak pernah dicetak.
   */
  constructor(
    readonly name: string,
    private readonly url: string,
    private readonly http: HttpClient,
    private readonly options: EvmRpcOptions = {},
  ) {}

  /** Panggil method JSON-RPC yang ada di daftar izin. */
  async request<T>(method: string, params: unknown[]): Promise<T> {
    if (!READ_ONLY_RPC_METHODS.has(method)) throw new ReadOnlyViolationError(method);
    const response = await this.http.requestJson<JsonRpcResponse>({
      provider: this.name,
      url: this.url,
      method: 'POST',
      body: { jsonrpc: '2.0', id: this.nextId++, method, params },
      timeoutMs: this.options.timeoutMs,
      retries: this.options.retries,
    });
    if (response === null || typeof response !== 'object' || Array.isArray(response)) {
      throw new ProviderError(this.name, `${method}: respons JSON-RPC tidak dikenali`);
    }
    if (response.error !== undefined && response.error !== null) {
      const code = typeof response.error.code === 'number' ? response.error.code : null;
      const message = typeof response.error.message === 'string' ? response.error.message : '';
      if (method === 'eth_call' && (code === 3 || /revert/i.test(message))) {
        throw new RpcRevertError(this.name);
      }
      throw new JsonRpcError(this.name, code, `${method} gagal: ${sanitizeMessage(message, code)}`);
    }
    if (!('result' in response)) {
      throw new ProviderError(this.name, `${method}: respons JSON-RPC tanpa result`);
    }
    return response.result as T;
  }

  async chainId(): Promise<number> {
    return this.quantity(await this.request('eth_chainId', []), 'eth_chainId');
  }

  async blockNumber(): Promise<number> {
    return this.quantity(await this.request('eth_blockNumber', []), 'eth_blockNumber');
  }

  async getBlock(block: BlockTag): Promise<EvmBlock | null> {
    const raw = await this.request<RawRecord | null>('eth_getBlockByNumber', [blockParam(block), false]);
    if (raw === null) return null;
    const transactions = Array.isArray(raw.transactions) ? raw.transactions : null;
    if (!transactions || !transactions.every((hash) => typeof hash === 'string')) {
      throw this.malformed('eth_getBlockByNumber');
    }
    return {
      number: this.quantity(raw.number, 'eth_getBlockByNumber'),
      hash: this.string(raw.hash, 'eth_getBlockByNumber'),
      timestamp: new Date(this.quantity(raw.timestamp, 'eth_getBlockByNumber') * 1000),
      transactionHashes: transactions as string[],
    };
  }

  async getTransaction(hash: string): Promise<EvmTransaction | null> {
    const raw = await this.request<RawRecord | null>('eth_getTransactionByHash', [hash]);
    if (raw === null) return null;
    return {
      hash: this.string(raw.hash, 'eth_getTransactionByHash'),
      from: this.string(raw.from, 'eth_getTransactionByHash'),
      to: typeof raw.to === 'string' ? raw.to : null,
      blockNumber: raw.blockNumber === null || raw.blockNumber === undefined ? null : this.quantity(raw.blockNumber, 'eth_getTransactionByHash'),
      input: typeof raw.input === 'string' ? raw.input : '0x',
    };
  }

  async getTransactionReceipt(hash: string): Promise<EvmReceipt | null> {
    const raw = await this.request<RawRecord | null>('eth_getTransactionReceipt', [hash]);
    if (raw === null) return null;
    const logs = Array.isArray(raw.logs) ? raw.logs : null;
    if (!logs) throw this.malformed('eth_getTransactionReceipt');
    return {
      transactionHash: this.string(raw.transactionHash, 'eth_getTransactionReceipt'),
      blockNumber: this.quantity(raw.blockNumber, 'eth_getTransactionReceipt'),
      from: this.string(raw.from, 'eth_getTransactionReceipt'),
      to: typeof raw.to === 'string' ? raw.to : null,
      contractAddress: typeof raw.contractAddress === 'string' ? raw.contractAddress : null,
      status: raw.status === '0x1' ? 'success' : raw.status === '0x0' ? 'reverted' : null,
      logs: logs.map((log) => this.log(log as RawRecord, 'eth_getTransactionReceipt')),
    };
  }

  async getLogs(filter: EvmLogFilter): Promise<EvmLog[]> {
    const params: RawRecord = { fromBlock: toHex(filter.fromBlock), toBlock: toHex(filter.toBlock) };
    if (filter.address !== undefined) params.address = filter.address;
    if (filter.topics !== undefined) params.topics = filter.topics;
    const raw = await this.request<unknown>('eth_getLogs', [params]);
    if (!Array.isArray(raw)) throw this.malformed('eth_getLogs');
    return raw.map((log) => this.log(log as RawRecord, 'eth_getLogs'));
  }

  async call(request: { to: string; data: string }, block: BlockTag): Promise<string> {
    return this.hexData(await this.request('eth_call', [{ to: request.to, data: request.data }, blockParam(block)]), 'eth_call');
  }

  async getCode(address: string, block: BlockTag): Promise<string> {
    return this.hexData(await this.request('eth_getCode', [address, blockParam(block)]), 'eth_getCode');
  }

  /** Nilai slot selalu dikembalikan 32 byte, walau node meringkasnya (mis. `0x0`). */
  async getStorageAt(address: string, slot: string, block: BlockTag): Promise<string> {
    const value = await this.request<unknown>('eth_getStorageAt', [address, slot, blockParam(block)]);
    if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{0,64}$/.test(value)) throw this.malformed('eth_getStorageAt');
    return `0x${value.slice(2).toLowerCase().padStart(64, '0')}`;
  }

  async traceTransaction(hash: string): Promise<unknown> {
    return this.request('debug_traceTransaction', [hash, { tracer: 'callTracer' }]);
  }

  private log(raw: RawRecord, method: string): EvmLog {
    if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.topics)) throw this.malformed(method);
    return {
      address: this.string(raw.address, method),
      topics: raw.topics.map((topic) => this.string(topic, method)),
      data: this.hexData(raw.data, method),
      blockNumber: this.quantity(raw.blockNumber, method),
      transactionHash: this.string(raw.transactionHash, method),
      logIndex: this.quantity(raw.logIndex, method),
    };
  }

  private quantity(value: unknown, method: string): number {
    if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) throw this.malformed(method);
    const parsed = Number(BigInt(value));
    if (!Number.isSafeInteger(parsed)) throw this.malformed(method);
    return parsed;
  }

  private hexData(value: unknown, method: string): string {
    if (typeof value !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(value)) throw this.malformed(method);
    return value.toLowerCase();
  }

  private string(value: unknown, method: string): string {
    if (typeof value !== 'string' || value === '') throw this.malformed(method);
    return value;
  }

  private malformed(method: string): ProviderError {
    return new ProviderError(this.name, `${method}: format respons tidak dikenali`);
  }
}

export function toHex(value: number): string {
  return `0x${value.toString(16)}`;
}

function blockParam(block: BlockTag): string {
  return block === 'latest' ? 'latest' : toHex(block);
}

/** Pesan error dari node, dipendekkan, tanpa URL, dan tanpa deretan mirip API key. */
function sanitizeMessage(message: string, code: number | null): string {
  const cleaned = sanitizeProviderText(message, 160);
  const text = cleaned === '' ? 'tanpa pesan' : cleaned;
  return code === null ? text : `${text} (kode ${code})`;
}
