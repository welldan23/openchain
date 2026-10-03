/**
 * Akses data aliran dana untuk halaman Lacak Aliran Dana.
 *
 * Selama fase frontend, fungsi di sini membaca data tiruan. Saat backend
 * siap, ganti isinya dengan pemanggilan API (asumsi kontrak:
 * `GET /flows/:chain/:address` → `AddressFlow`) tanpa mengubah komponen yang
 * memakainya.
 */
import { addressKey } from "../fund-flow";
import { MOCK_FAILING_FLOW, MOCK_FLOWS } from "../mock/flows";
import type { AddressFlow, AddressFlowSummary, ChainId } from "../types";

/** Latensi tiruan supaya tampilan loading terlihat selama fase frontend. */
const MOCK_LATENCY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sameAddress(chain: ChainId, a: string, b: string): boolean {
  return addressKey(chain, a) === addressKey(chain, b);
}

/**
 * Ambil aliran dana satu address.
 * - Mengembalikan `null` bila address tidak dikenal.
 * - Melempar error bila sumber data gagal (di mock: address simulasi gagal).
 */
export async function getAddressFlow(chain: ChainId, address: string): Promise<AddressFlow | null> {
  await delay(MOCK_LATENCY_MS);

  if (chain === MOCK_FAILING_FLOW.chain && sameAddress(chain, address, MOCK_FAILING_FLOW.address)) {
    throw new Error("Simulasi: sumber data aliran dana tidak bisa dihubungi.");
  }

  const found = MOCK_FLOWS.find(
    (flow) => flow.chain === chain && sameAddress(chain, flow.address, address),
  );
  return found ?? null;
}

/** Daftar address contoh untuk dibuka dari beranda. */
export async function listSampleFlows(): Promise<AddressFlowSummary[]> {
  return MOCK_FLOWS.map((flow) => ({
    chain: flow.chain,
    address: flow.address,
    label: flow.label,
    transferCount: flow.transfers.length,
  }));
}

/** Tautan ke address yang sengaja gagal dimuat, untuk mencoba tampilan error. */
export function flowFailureDemoPath(): `/flow/${string}` {
  return flowPath(MOCK_FAILING_FLOW.chain, MOCK_FAILING_FLOW.address);
}

export function flowPath(chain: ChainId, address: string): `/flow/${string}` {
  return `/flow/${chain}/${address}`;
}
