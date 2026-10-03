/**
 * Akses data token untuk halaman investigasi.
 *
 * Selama fase frontend, fungsi di sini membaca data tiruan. Saat backend
 * siap, ganti isinya dengan pemanggilan API (asumsi kontrak:
 * `GET /tokens/:chain/:address` → `TokenInvestigation`) tanpa mengubah
 * komponen yang memakainya.
 */
import { CHAINS } from "../chains";
import { MOCK_FAILING_TOKEN, MOCK_TOKENS } from "../mock/tokens";
import type { ChainId, TokenInvestigation, TokenSummary } from "../types";

/** Latensi tiruan supaya tampilan loading terlihat selama fase frontend. */
const MOCK_LATENCY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Address EVM tidak case-sensitive, address Solana case-sensitive. */
function sameAddress(chain: ChainId, a: string, b: string): boolean {
  return CHAINS[chain].addressFormat === "evm"
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

/**
 * Ambil data investigasi satu token.
 * - Mengembalikan `null` bila token tidak ditemukan.
 * - Melempar error bila sumber data gagal (di mock: address simulasi gagal).
 */
export async function getTokenInvestigation(
  chain: ChainId,
  address: string,
): Promise<TokenInvestigation | null> {
  await delay(MOCK_LATENCY_MS);

  if (chain === MOCK_FAILING_TOKEN.chain && sameAddress(chain, address, MOCK_FAILING_TOKEN.address)) {
    throw new Error("Simulasi: sumber data token tidak bisa dihubungi.");
  }

  const found = MOCK_TOKENS.find(
    (item) => item.token.chain === chain && sameAddress(chain, item.token.address, address),
  );
  return found ?? null;
}

/** Daftar token contoh untuk dibuka dari beranda. */
export async function listSampleTokens(): Promise<TokenSummary[]> {
  return MOCK_TOKENS.map(({ token, risk }) => ({
    chain: token.chain,
    address: token.address,
    name: token.name,
    symbol: token.symbol,
    riskLevel: risk.level,
  }));
}

/** Tautan ke token yang sengaja gagal dimuat, untuk mencoba tampilan error. */
export function failureDemoPath(): `/token/${string}` {
  return tokenPath(MOCK_FAILING_TOKEN.chain, MOCK_FAILING_TOKEN.address);
}

export function tokenPath(chain: ChainId, address: string): `/token/${string}` {
  return `/token/${chain}/${address}`;
}
