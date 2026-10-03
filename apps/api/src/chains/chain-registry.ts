/**
 * Merakit adapter chain dari definisi dan environment variable.
 *
 * Environment variable yang dibaca (semuanya opsional):
 * - `RPC_URL_<CHAIN>`: ganti RPC publik, mis. dengan RPC berbayar ber-API key.
 *   Beberapa URL dipisah koma; urutannya menjadi urutan fallback.
 * - `BLOCKSCOUT_API_KEY`: pakai Blockscout PRO API untuk chain yang di-host
 *   Blockscout, termasuk Robinhood Chain.
 * - `BLOCKSCOUT_URL_<CHAIN>`: ganti instance Blockscout sebuah chain.
 * - `PROVIDER_TIMEOUT_MS`: batas waktu tiap request provider (default 15000).
 *
 * URL dan API key tidak pernah dicetak; `describe` hanya menyebut asalnya.
 */
import { BLOCKSCOUT_PRO_API_URL, BlockscoutProvider } from '../providers/blockscout.provider.js';
import { DexscreenerProvider } from '../providers/dexscreener.provider.js';
import { EvmJsonRpcProvider } from '../providers/evm-rpc.provider.js';
import { FallbackRpcProvider } from '../providers/fallback-rpc.provider.js';
import { DEFAULT_TIMEOUT_MS, HttpClient } from '../providers/http-client.js';
import type { ChainAdapter } from './chain-adapter.types.js';
import {
  blockscoutEnvVar,
  EVM_CHAIN_DEFINITIONS,
  PHASE_4_CHAINS,
  rpcEnvVar,
  type EvmChainDefinition,
} from './chain-definitions.js';
import { EvmChainAdapter, type EvmAdapterOptions } from './evm/evm-chain-adapter.js';

export type Env = Readonly<Record<string, string | undefined>>;

/** Chain tidak dikenal atau adapternya belum ada. */
export class ChainNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChainNotSupportedError';
  }
}

/** Asal konfigurasi provider sebuah chain, tanpa URL atau API key. */
export interface ChainSetup {
  chainId: string;
  name: string;
  evmChainId: number;
  rpc: string;
  explorer: string;
  market: string;
}

export class ChainRegistry {
  constructor(
    private readonly env: Env,
    private readonly http: HttpClient = new HttpClient(),
    private readonly definitions: readonly EvmChainDefinition[] = EVM_CHAIN_DEFINITIONS,
    private readonly adapterOptions: EvmAdapterOptions = {},
  ) {}

  /** Id semua chain yang punya adapter, urut prioritas. */
  chainIds(): string[] {
    return this.definitions.map((definition) => definition.id);
  }

  definition(chainId: string): EvmChainDefinition {
    const definition = this.definitions.find((candidate) => candidate.id === chainId);
    if (definition) return definition;
    if (PHASE_4_CHAINS.includes(chainId)) {
      throw new ChainNotSupportedError(`Adapter untuk chain "${chainId}" belum ada; dijadwalkan di fase 4.`);
    }
    throw new ChainNotSupportedError(
      `Chain "${chainId}" tidak dikenal. Pilihan: ${this.chainIds().join(', ')}.`,
    );
  }

  adapter(chainId: string): ChainAdapter {
    const definition = this.definition(chainId);
    const timeoutMs = this.timeoutMs();
    const blockscout = this.blockscoutConfig(definition);
    const explorer = blockscout ? new BlockscoutProvider({ ...blockscout, timeoutMs }, this.http) : null;
    return new EvmChainAdapter(
      definition,
      {
        rpc: this.rpcProvider(definition, timeoutMs),
        explorer,
        indexer: explorer,
        market: definition.dexscreenerSlug ? new DexscreenerProvider(definition.dexscreenerSlug, 'evm', this.http) : null,
      },
      this.adapterOptions,
    );
  }

  /** Ringkasan asal konfigurasi, aman untuk dicetak. */
  describe(chainId: string): ChainSetup {
    const definition = this.definition(chainId);
    const rpcVar = rpcEnvVar(definition.id);
    const blockscout = this.blockscoutConfig(definition);
    let explorer = 'tidak ada';
    if (blockscout?.apiKey) explorer = 'Blockscout PRO API (BLOCKSCOUT_API_KEY)';
    else if (this.value(blockscoutEnvVar(definition.id))) explorer = `Blockscout dari ${blockscoutEnvVar(definition.id)}`;
    else if (blockscout) explorer = 'Blockscout instance publik';
    return {
      chainId: definition.id,
      name: definition.name,
      evmChainId: definition.evmChainId,
      rpc: `${this.value(rpcVar) ? `dari ${rpcVar}` : 'RPC publik default'} (${this.rpcUrls(definition).length} endpoint)`,
      explorer,
      market: definition.dexscreenerSlug ? `Dexscreener (${definition.dexscreenerSlug})` : 'tidak ada',
    };
  }

  /** Satu endpoint dipakai langsung; lebih dari satu dibungkus fallback. */
  private rpcProvider(definition: EvmChainDefinition, timeoutMs: number) {
    const name = `${definition.id}-rpc`;
    const endpoints = this.rpcUrls(definition).map(
      (url, index, urls) =>
        new EvmJsonRpcProvider(urls.length === 1 ? name : `${name}-${index + 1}`, url, this.http, { timeoutMs }),
    );
    return endpoints.length === 1 ? endpoints[0] : new FallbackRpcProvider(name, endpoints);
  }

  private rpcUrls(definition: EvmChainDefinition): string[] {
    const override = this.value(rpcEnvVar(definition.id));
    if (!override) return [...definition.rpc.defaultUrls];
    const urls = override
      .split(',')
      .map((url) => url.trim())
      .filter((url) => url !== '');
    return urls.length > 0 ? urls : [...definition.rpc.defaultUrls];
  }

  private blockscoutConfig(definition: EvmChainDefinition): { baseUrl: string; apiKey: string | null } | null {
    const override = this.value(blockscoutEnvVar(definition.id));
    if (override) return { baseUrl: override, apiKey: null };
    if (!definition.blockscout) return null;
    const apiKey = this.value('BLOCKSCOUT_API_KEY');
    if (apiKey && definition.blockscout.proApi) {
      return { baseUrl: `${BLOCKSCOUT_PRO_API_URL}/${definition.evmChainId}`, apiKey };
    }
    return { baseUrl: definition.blockscout.instanceUrl, apiKey: null };
  }

  private timeoutMs(): number {
    const raw = this.value('PROVIDER_TIMEOUT_MS');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
  }

  private value(name: string): string | undefined {
    const raw = this.env[name]?.trim();
    return raw ? raw : undefined;
  }
}
