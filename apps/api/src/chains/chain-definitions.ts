/**
 * Definisi adapter chain EVM. Sesuai PRD, setiap adapter mendefinisikan RPC,
 * explorer, indexer, token standard, model blok, model event, dan format
 * address. Endpoint default adalah endpoint publik yang chain ID-nya sudah
 * dicek; semuanya bisa diganti lewat environment variable.
 *
 * Definisi ini bukan klaim dukungan. Status dukungan ada di tabel `chains` dan
 * hanya naik lewat smoke test (`npm run smoke:chain`).
 */
export interface EvmChainDefinition {
  /** Sama dengan `chains.id` di database. */
  id: string;
  name: string;
  family: 'evm';
  evmChainId: number;
  /** Address 20 byte hex dengan prefix 0x, tidak peka huruf besar-kecil. */
  addressFormat: 'evm_hex20';
  tokenStandard: 'erc20';
  /** Blok bernomor urut dengan timestamp; state dibaca per nomor blok. */
  blockModel: 'evm_block';
  /** Event berupa log (address, topics, data) per transaksi. */
  eventModel: 'evm_log';
  /**
   * Endpoint RPC sesuai prioritas. Bila satu endpoint gagal atau menolak
   * sebuah method, panggilan pindah ke endpoint berikutnya.
   */
  rpc: { defaultUrls: readonly string[] };
  /**
   * Blockscout sebagai explorer sekaligus indexer. `proApi` berarti instance
   * di-host Blockscout sehingga bisa diakses lewat PRO API dengan API key.
   * `null` bila belum ada sumber yang terverifikasi.
   */
  blockscout: { instanceUrl: string; proApi: boolean } | null;
  /** Id chain versi Dexscreener; `null` bila belum didukung Dexscreener. */
  dexscreenerSlug: string | null;
  /**
   * Token contoh untuk smoke test: token populer yang punya pair DEX dan daftar
   * holder yang cepat dibaca (umumnya wrapped native token).
   */
  smokeTestToken: { address: string; symbol: string };
}

const EVM_MODELS = {
  family: 'evm',
  addressFormat: 'evm_hex20',
  tokenStandard: 'erc20',
  blockModel: 'evm_block',
  eventModel: 'evm_log',
} as const;

/**
 * Urutan mengikuti prioritas adapter di PRD: Robinhood Chain dulu, lalu chain
 * EVM lain. Chain ID setiap RPC default, address token contoh (lewat
 * `symbol()`), dan id Dexscreener (lewat pair token contoh) sudah dicek.
 */
export const EVM_CHAIN_DEFINITIONS: readonly EvmChainDefinition[] = [
  {
    id: 'robinhood',
    name: 'Robinhood Chain',
    ...EVM_MODELS,
    evmChainId: 4663,
    rpc: { defaultUrls: ['https://rpc.mainnet.chain.robinhood.com', 'https://robinhood-rpc.publicnode.com'] },
    blockscout: { instanceUrl: 'https://robinhoodchain.blockscout.com', proApi: true },
    dexscreenerSlug: 'robinhood',
    smokeTestToken: { address: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', symbol: 'WETH' },
  },
  {
    id: 'ethereum',
    name: 'Ethereum',
    ...EVM_MODELS,
    evmChainId: 1,
    rpc: { defaultUrls: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'] },
    blockscout: { instanceUrl: 'https://eth.blockscout.com', proApi: true },
    dexscreenerSlug: 'ethereum',
    smokeTestToken: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH' },
  },
  {
    id: 'base',
    name: 'Base',
    ...EVM_MODELS,
    evmChainId: 8453,
    rpc: { defaultUrls: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'] },
    blockscout: { instanceUrl: 'https://base.blockscout.com', proApi: true },
    dexscreenerSlug: 'base',
    // Daftar holder WETH di Blockscout Base terlalu lambat (>60 detik); AERO cepat.
    smokeTestToken: { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', symbol: 'AERO' },
  },
  {
    id: 'bsc',
    name: 'BNB Chain',
    ...EVM_MODELS,
    evmChainId: 56,
    // Tidak ada RPC publik gratis yang melayani semua method sendirian: RPC
    // resmi menolak eth_getLogs, publicnode menolak receipt. Digabung lewat
    // fallback, keduanya saling menutup.
    rpc: { defaultUrls: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-rpc.publicnode.com'] },
    // Blockscout tidak meng-host BNB Chain; explorer lain menyusul.
    blockscout: null,
    dexscreenerSlug: 'bsc',
    smokeTestToken: { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB' },
  },
  {
    id: 'arbitrum',
    name: 'Arbitrum One',
    ...EVM_MODELS,
    evmChainId: 42161,
    rpc: { defaultUrls: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'] },
    blockscout: { instanceUrl: 'https://arbitrum.blockscout.com', proApi: true },
    dexscreenerSlug: 'arbitrum',
    // Daftar holder WETH di Blockscout Arbitrum terlalu lambat (>60 detik); ARB cepat.
    smokeTestToken: { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', symbol: 'ARB' },
  },
  {
    id: 'optimism',
    name: 'OP Mainnet',
    ...EVM_MODELS,
    evmChainId: 10,
    rpc: { defaultUrls: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com'] },
    blockscout: { instanceUrl: 'https://explorer.optimism.io', proApi: true },
    dexscreenerSlug: 'optimism',
    smokeTestToken: { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH' },
  },
  {
    id: 'polygon',
    name: 'Polygon PoS',
    ...EVM_MODELS,
    evmChainId: 137,
    rpc: { defaultUrls: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'] },
    blockscout: { instanceUrl: 'https://polygon.blockscout.com', proApi: true },
    dexscreenerSlug: 'polygon',
    smokeTestToken: { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', symbol: 'WPOL' },
  },
  {
    id: 'hyperevm',
    name: 'HyperEVM',
    ...EVM_MODELS,
    evmChainId: 999,
    rpc: { defaultUrls: ['https://rpc.hyperliquid.xyz/evm'] },
    // Explorer Blockscout HyperEVM (hyperscan.com) sedang dialihkan; menyusul.
    blockscout: null,
    dexscreenerSlug: 'hyperevm',
    smokeTestToken: { address: '0x5555555555555555555555555555555555555555', symbol: 'WHYPE' },
  },
];

/** Chain non-EVM yang adapternya dijadwalkan di fase 4. */
export const PHASE_4_CHAINS: readonly string[] = ['solana', 'bitcoin', 'tron', 'ton'];

/**
 * Nama environment variable untuk mengganti URL RPC, mis. `RPC_URL_ROBINHOOD`.
 * Beberapa URL dipisah koma, urut prioritas.
 */
export function rpcEnvVar(chainId: string): string {
  return `RPC_URL_${chainId.toUpperCase().replace(/-/g, '_')}`;
}

/** Nama environment variable untuk mengganti URL Blockscout, mis. `BLOCKSCOUT_URL_BSC`. */
export function blockscoutEnvVar(chainId: string): string {
  return `BLOCKSCOUT_URL_${chainId.toUpperCase().replace(/-/g, '_')}`;
}
