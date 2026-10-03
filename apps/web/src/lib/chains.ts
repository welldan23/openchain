import type { ChainId } from "./types";

export interface ChainInfo {
  id: ChainId;
  name: string;
  /** Simbol native coin, mis. ETH atau SOL. */
  nativeSymbol: string;
  addressFormat: "evm" | "solana";
  explorer: {
    name: string;
    baseUrl: string;
  };
  /** Kelas Tailwind untuk badge chain. */
  badgeClass: string;
}

export const CHAINS: Record<ChainId, ChainInfo> = {
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    nativeSymbol: "ETH",
    addressFormat: "evm",
    explorer: { name: "Etherscan", baseUrl: "https://etherscan.io" },
    badgeClass: "bg-indigo-500/15 text-indigo-300 ring-indigo-400/30",
  },
  bsc: {
    id: "bsc",
    name: "BNB Chain",
    nativeSymbol: "BNB",
    addressFormat: "evm",
    explorer: { name: "BscScan", baseUrl: "https://bscscan.com" },
    badgeClass: "bg-yellow-500/15 text-yellow-300 ring-yellow-400/30",
  },
  solana: {
    id: "solana",
    name: "Solana",
    nativeSymbol: "SOL",
    addressFormat: "solana",
    explorer: { name: "Solscan", baseUrl: "https://solscan.io" },
    badgeClass: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-400/30",
  },
  base: {
    id: "base",
    name: "Base",
    nativeSymbol: "ETH",
    addressFormat: "evm",
    explorer: { name: "BaseScan", baseUrl: "https://basescan.org" },
    badgeClass: "bg-blue-500/15 text-blue-300 ring-blue-400/30",
  },
  arbitrum: {
    id: "arbitrum",
    name: "Arbitrum",
    nativeSymbol: "ETH",
    addressFormat: "evm",
    explorer: { name: "Arbiscan", baseUrl: "https://arbiscan.io" },
    badgeClass: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
  },
};

export function isChainId(value: string): value is ChainId {
  return Object.hasOwn(CHAINS, value);
}

export function getChain(id: ChainId): ChainInfo {
  return CHAINS[id];
}

/** URL explorer untuk transaksi. Solscan & Etherscan sama-sama memakai /tx/. */
export function explorerTxUrl(chain: ChainId, txHash: string): string {
  return `${CHAINS[chain].explorer.baseUrl}/tx/${txHash}`;
}

/** URL explorer untuk address. Solscan memakai /account/, EVM memakai /address/. */
export function explorerAddressUrl(chain: ChainId, address: string): string {
  const info = CHAINS[chain];
  const path = info.addressFormat === "solana" ? "account" : "address";
  return `${info.explorer.baseUrl}/${path}/${address}`;
}

/** URL explorer untuk kontrak token. */
export function explorerTokenUrl(chain: ChainId, address: string): string {
  return `${CHAINS[chain].explorer.baseUrl}/token/${address}`;
}
