/**
 * Penilaian risiko objek (token, wallet, kontrak).
 *
 * Mode live memakai `./live/risk` (`/api/risk/:chain/:address`); mode tiruan
 * membaca data tiruan.
 */
import { CHAINS } from "../chains";
import { MOCK_FAILING_RISK, MOCK_RISKS } from "../mock/risk";
import type { ChainId, ObjectRisk, ObjectRiskSummary } from "../types";
import { isLive } from "./http";
import * as live from "./live/risk";

const MOCK_LATENCY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Address EVM tidak case-sensitive, address Solana case-sensitive. */
function sameAddress(chain: ChainId, a: string, b: string): boolean {
  return CHAINS[chain].addressFormat === "evm" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * Penilaian risiko satu objek.
 * - `null` bila objek belum pernah dinilai.
 * - Melempar error bila sumber data gagal (di mock: address simulasi gagal).
 */
export async function getObjectRisk(chain: ChainId, address: string): Promise<ObjectRisk | null> {
  if (isLive()) return live.getObjectRisk(chain, address);
  await delay(MOCK_LATENCY_MS);
  if (chain === MOCK_FAILING_RISK.chain && sameAddress(chain, address, MOCK_FAILING_RISK.address)) {
    throw new Error("Simulasi: layanan penilaian risiko tidak bisa dihubungi.");
  }
  return MOCK_RISKS.find((item) => item.chain === chain && sameAddress(chain, item.address, address)) ?? null;
}

/** Objek contoh untuk dibuka dari beranda. */
export async function listSampleRisks(): Promise<ObjectRiskSummary[]> {
  return MOCK_RISKS.map(({ kind, chain, address, title, score, level, warnings }) => ({
    kind,
    chain,
    address,
    title,
    score,
    level,
    warningCount: warnings.length,
  }));
}

export function riskPath(chain: ChainId, address: string): `/risiko/${string}` {
  return `/risiko/${chain}/${address}`;
}

export function riskFailureDemoPath(): `/risiko/${string}` {
  return riskPath(MOCK_FAILING_RISK.chain, MOCK_FAILING_RISK.address);
}
