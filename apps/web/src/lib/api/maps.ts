/**
 * Akses data peta hubungan wallet untuk halaman Peta Hubungan Wallet.
 *
 * Selama fase frontend, fungsi di sini membaca data tiruan. Saat backend
 * siap, ganti isinya dengan pemanggilan API (asumsi kontrak:
 * `GET /maps/:chain/:token` → `WalletMap`) tanpa mengubah komponen yang
 * memakainya.
 */
import { addressKey } from "../fund-flow";
import { MOCK_FAILING_MAP, MOCK_MAPS } from "../mock/maps";
import type { ChainId, WalletMap, WalletMapSummary } from "../types";

/** Latensi tiruan supaya tampilan loading terlihat selama fase frontend. */
const MOCK_LATENCY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sameAddress(chain: ChainId, a: string, b: string): boolean {
  return addressKey(chain, a) === addressKey(chain, b);
}

/**
 * Ambil peta hubungan holder satu token.
 * - Mengembalikan `null` bila token tidak dikenal.
 * - Melempar error bila sumber data gagal (di mock: token simulasi gagal).
 */
export async function getWalletMap(chain: ChainId, token: string): Promise<WalletMap | null> {
  await delay(MOCK_LATENCY_MS);

  if (chain === MOCK_FAILING_MAP.chain && sameAddress(chain, token, MOCK_FAILING_MAP.address)) {
    throw new Error("Simulasi: sumber data peta hubungan tidak bisa dihubungi.");
  }

  const found = MOCK_MAPS.find((map) => map.chain === chain && sameAddress(chain, map.token.address, token));
  return found ?? null;
}

/** Daftar peta contoh untuk dibuka dari beranda. */
export async function listSampleMaps(): Promise<WalletMapSummary[]> {
  return MOCK_MAPS.map((map) => ({
    chain: map.chain,
    tokenAddress: map.token.address,
    name: map.token.name,
    symbol: map.token.symbol,
    walletCount: map.nodes.length,
    clusterCount: map.clusters.length,
  }));
}

/** Tautan ke peta yang sengaja gagal dimuat, untuk mencoba tampilan error. */
export function mapFailureDemoPath(): `/map/${string}` {
  return mapPath(MOCK_FAILING_MAP.chain, MOCK_FAILING_MAP.address);
}

export function mapPath(chain: ChainId, token: string): `/map/${string}` {
  return `/map/${chain}/${token}`;
}
