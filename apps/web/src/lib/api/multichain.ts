/**
 * Akses data aktivitas lintas chain untuk halaman Jelajah Multichain.
 *
 * Selama fase frontend, fungsi di sini membaca data tiruan. Saat backend
 * siap, ganti isinya dengan pemanggilan API (asumsi kontrak:
 * `GET /multichain/:address` → `MultichainProfile`) tanpa mengubah komponen
 * yang memakainya.
 */
import { MOCK_FAILING_MULTICHAIN, MOCK_MULTICHAIN } from "../mock/multichain";
import { isActive, isEvmAddress } from "../multichain";
import type { MultichainProfile, MultichainProfileSummary } from "../types";

/** Latensi tiruan supaya tampilan loading terlihat selama fase frontend. */
const MOCK_LATENCY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ambil aktivitas satu address EVM di semua chain EVM.
 * - Mengembalikan `null` bila address bukan EVM atau tidak dikenal.
 * - Melempar error bila sumber data gagal (di mock: address simulasi gagal).
 */
export async function getMultichainProfile(address: string): Promise<MultichainProfile | null> {
  await delay(MOCK_LATENCY_MS);
  if (!isEvmAddress(address)) return null;
  const key = address.toLowerCase();
  if (key === MOCK_FAILING_MULTICHAIN.toLowerCase()) {
    throw new Error("Simulasi: sumber data lintas chain tidak bisa dihubungi.");
  }
  return MOCK_MULTICHAIN.find((profile) => profile.address.toLowerCase() === key) ?? null;
}

/** Address contoh untuk dibuka dari beranda. */
export async function listSampleMultichain(): Promise<MultichainProfileSummary[]> {
  return MOCK_MULTICHAIN.map((profile) => ({
    address: profile.address,
    label: profile.label,
    activeChains: profile.chains.filter(isActive).map((item) => item.chain),
  }));
}

export function multichainPath(address: string): `/multichain/${string}` {
  return `/multichain/${address}`;
}

/** Tautan ke address yang sengaja gagal dimuat, untuk mencoba tampilan error. */
export function multichainFailureDemoPath(): `/multichain/${string}` {
  return multichainPath(MOCK_FAILING_MULTICHAIN);
}
