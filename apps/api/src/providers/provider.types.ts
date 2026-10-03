/**
 * Abstraksi provider sesuai PRD: RPCProvider, ExplorerProvider,
 * IndexedDataProvider, MarketDataProvider, EntityLabelProvider, dan
 * SecurityProvider. Adapter chain hanya bicara lewat interface ini, supaya
 * logika satu chain atau satu vendor tidak tertanam di seluruh aplikasi.
 *
 * Semua provider read-only. Tidak ada method untuk signing, approval, atau
 * mengirim transaksi.
 */
import type { DataStatus, EntityLabelType, ProviderKind } from '../database/schema/enums.js';

/**
 * Kegagalan provider. `reason` aman disimpan dan ditampilkan: tidak pernah
 * berisi URL, header, atau API key.
 */
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly reason: string,
  ) {
    super(`${provider}: ${reason}`);
    this.name = 'ProviderError';
  }
}

/** Catatan satu pengambilan data provider; disimpan ke tabel `provider_runs`. */
export interface ProviderRunRecord {
  /** Kunci lokal supaya bukti bisa menunjuk run ini sebelum punya id database. */
  key: string;
  provider: string;
  kind: ProviderKind;
  /** Operasi yang dijalankan, mis. `token.holders`. */
  operation: string;
  /** Address atau hash yang diminta. */
  subject: string | null;
  status: DataStatus;
  errorReason: string | null;
  missingFields: string[];
  blockFrom: number | null;
  blockTo: number | null;
  startedAt: Date;
  fetchedAt: Date | null;
}

// ---------------------------------------------------------------------------
// RPCProvider: JSON-RPC EVM. Chain non-EVM (fase 4) punya interface RPC sendiri.
// ---------------------------------------------------------------------------

/** Nomor blok, atau `latest` untuk blok terbaru. */
export type BlockTag = number | 'latest';

export interface EvmBlock {
  number: number;
  hash: string;
  timestamp: Date;
  transactionHashes: string[];
}

export interface EvmTransaction {
  hash: string;
  from: string;
  to: string | null;
  blockNumber: number | null;
  input: string;
}

export interface EvmLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

export interface EvmReceipt {
  transactionHash: string;
  blockNumber: number;
  from: string;
  to: string | null;
  /** Terisi bila transaksi langsung membuat kontrak. */
  contractAddress: string | null;
  status: 'success' | 'reverted' | null;
  logs: EvmLog[];
}

export interface EvmLogFilter {
  address?: string;
  topics?: Array<string | null>;
  fromBlock: number;
  toBlock: number;
}

export interface RpcProvider {
  readonly name: string;
  chainId(): Promise<number>;
  blockNumber(): Promise<number>;
  getBlock(block: BlockTag): Promise<EvmBlock | null>;
  getTransaction(hash: string): Promise<EvmTransaction | null>;
  getTransactionReceipt(hash: string): Promise<EvmReceipt | null>;
  getLogs(filter: EvmLogFilter): Promise<EvmLog[]>;
  /** `eth_call`; revert dilempar sebagai `RpcRevertError`. */
  call(request: { to: string; data: string }, block: BlockTag): Promise<string>;
  getCode(address: string, block: BlockTag): Promise<string>;
  getStorageAt(address: string, slot: string, block: BlockTag): Promise<string>;
  /** Opsional: banyak RPC publik tidak membuka namespace `debug_`. */
  traceTransaction(hash: string): Promise<unknown>;
}

/** `eth_call` yang di-revert kontrak, mis. karena fungsinya tidak ada. */
export class RpcRevertError extends ProviderError {
  constructor(provider: string) {
    super(provider, 'Panggilan kontrak di-revert');
    this.name = 'RpcRevertError';
  }
}

// ---------------------------------------------------------------------------
// ExplorerProvider: informasi kontrak dari block explorer.
// ---------------------------------------------------------------------------

export interface ExplorerContractInfo {
  isContract: boolean | null;
  /** Source code terverifikasi di explorer; `null` bila tidak diketahui. */
  verified: boolean | null;
  contractName: string | null;
  creatorAddress: string | null;
  creationTxHash: string | null;
}

export interface ExplorerProvider {
  readonly name: string;
  /** `null` bila explorer tidak mengenal address tersebut. */
  getContract(address: string): Promise<ExplorerContractInfo | null>;
}

// ---------------------------------------------------------------------------
// IndexedDataProvider: data hasil indexing, mis. daftar holder.
// ---------------------------------------------------------------------------

/** Label entitas dari sumber eksternal, bukan bukti kepemilikan. */
export interface ExternalLabel {
  type: EntityLabelType;
  name: string | null;
}

export interface IndexedTokenInfo {
  /** Jenis token menurut indexer, mis. `ERC-20` atau `ERC-721`. */
  type: string | null;
  holderCount: number | null;
}

export interface IndexedHolder {
  address: string;
  isContract: boolean | null;
  /** Saldo menurut indexer; diverifikasi ulang lewat RPC sebelum disimpan. */
  balanceRaw: string;
  labels: ExternalLabel[];
}

export interface IndexedDataProvider {
  readonly name: string;
  /** `null` bila indexer tidak mengenal token tersebut. */
  getTokenInfo(address: string): Promise<IndexedTokenInfo | null>;
  getTopHolders(address: string): Promise<IndexedHolder[]>;
}

// ---------------------------------------------------------------------------
// MarketDataProvider: harga, likuiditas, dan volume dari pasar DEX.
// ---------------------------------------------------------------------------

/** Angka pasar dalam bentuk string desimal supaya presisi terjaga. */
export interface TokenMarketData {
  /** Jumlah pool DEX yang memuat token ini, sebagai base maupun quote. */
  poolCount: number;
  /** Jumlah pair DEX dengan token ini sebagai base token; harga diambil dari sini. */
  pairCount: number;
  priceUsd: string | null;
  priceChange24hPct: string | null;
  marketCapUsd: string | null;
  fdvUsd: string | null;
  liquidityUsd: string | null;
  volume24hUsd: string | null;
  txCount24h: number | null;
  /** Field yang tidak tersedia atau nilainya tidak masuk akal. */
  missingFields: string[];
}

export interface MarketDataProvider {
  readonly name: string;
  getTokenMarket(address: string): Promise<TokenMarketData>;
}

// ---------------------------------------------------------------------------
// EntityLabelProvider dan SecurityProvider: interface untuk sumber khusus.
// Implementasinya menyusul di fitur Risiko & Label (fase 3). Saat ini label
// eksternal ikut dari data holder Blockscout.
// ---------------------------------------------------------------------------

export interface EntityLabelProvider {
  readonly name: string;
  getLabels(addresses: string[]): Promise<Map<string, ExternalLabel[]>>;
}

export interface TokenSecurityReport {
  /** Hasil simulasi jual; `null` bila tidak disimulasikan. */
  sellable: boolean | null;
  buyTaxPct: string | null;
  sellTaxPct: string | null;
  missingFields: string[];
}

export interface SecurityProvider {
  readonly name: string;
  getTokenSecurity(address: string): Promise<TokenSecurityReport>;
}
