/**
 * Akses data token untuk halaman investigasi.
 *
 * Selama fase frontend, fungsi di sini membaca data tiruan. Saat backend
 * siap, ganti isinya dengan pemanggilan API (asumsi kontrak:
 * `GET /tokens/:chain/:address` → `TokenInvestigation`) tanpa mengubah
 * komponen yang memakainya.
 */
import { CHAINS } from "../chains";
import { MOCK_TOKENS } from "../mock/tokens";
import type { ChainId, TokenInvestigation, TokenSummary } from "../types";

/** Address EVM tidak case-sensitive, address Solana case-sensitive. */
function sameAddress(chain: ChainId, a: string, b: string): boolean {
  return CHAINS[chain].addressFormat === "evm"
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

export async function getTokenInvestigation(
  chain: ChainId,
  address: string,
): Promise<TokenInvestigation | null> {
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

export function tokenPath(chain: ChainId, address: string): `/token/${string}` {
  return `/token/${chain}/${address}`;
}
