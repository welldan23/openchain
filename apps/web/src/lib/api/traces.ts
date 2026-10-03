/**
 * Akses data jalur dana antar wallet untuk fitur Telusur Antar Wallet.
 *
 * Selama fase frontend, fungsi di sini membaca data tiruan. Saat backend
 * siap, ganti isinya dengan pemanggilan API (asumsi kontrak:
 * `GET /traces/:chain/:from/:to` → `WalletTrace`) tanpa mengubah komponen
 * yang memakainya.
 */
import { addressKey } from "../fund-flow";
import { MOCK_FAILING_TRACE, MOCK_TRACES } from "../mock/traces";
import type { ChainId, WalletTrace, WalletTraceSummary } from "../types";

/** Latensi tiruan supaya tampilan loading terlihat selama fase frontend. */
const MOCK_LATENCY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sameAddress(chain: ChainId, a: string, b: string): boolean {
  return addressKey(chain, a) === addressKey(chain, b);
}

/**
 * Ambil jalur dana dari `from` ke `to`.
 * - Mengembalikan `null` bila pasangan address tidak dikenal.
 * - Jalur dengan `hops` kosong berarti tidak ada jalur dalam batas langkah.
 * - Melempar error bila sumber data gagal (di mock: jalur simulasi gagal).
 */
export async function getWalletTrace(chain: ChainId, from: string, to: string): Promise<WalletTrace | null> {
  await delay(MOCK_LATENCY_MS);

  if (
    chain === MOCK_FAILING_TRACE.chain &&
    sameAddress(chain, from, MOCK_FAILING_TRACE.from) &&
    sameAddress(chain, to, MOCK_FAILING_TRACE.to)
  ) {
    throw new Error("Simulasi: sumber data jalur dana tidak bisa dihubungi.");
  }

  const found = MOCK_TRACES.find(
    (trace) => trace.chain === chain && sameAddress(chain, trace.from, from) && sameAddress(chain, trace.to, to),
  );
  return found ?? null;
}

function summary(trace: WalletTrace): WalletTraceSummary {
  return {
    chain: trace.chain,
    from: trace.from,
    fromLabel: trace.fromLabel,
    to: trace.to,
    toLabel: trace.toLabel,
    hopCount: trace.hops.length,
  };
}

/** Jalur contoh untuk dibuka dari beranda. */
export async function listSampleTraces(): Promise<WalletTraceSummary[]> {
  return MOCK_TRACES.map(summary);
}

/** Jalur yang berawal, berakhir, atau melewati `address`, untuk ditautkan dari halaman aliran dana. */
export async function listTracesForAddress(chain: ChainId, address: string): Promise<WalletTraceSummary[]> {
  const touches = (trace: WalletTrace) =>
    [trace.from, trace.to, ...trace.hops.flatMap((hop) => [hop.from, hop.to])].some((item) =>
      sameAddress(chain, item, address),
    );
  return MOCK_TRACES.filter((trace) => trace.chain === chain && touches(trace)).map(summary);
}

/** Tautan ke jalur yang sengaja gagal dimuat, untuk mencoba tampilan error. */
export function traceFailureDemoPath(): `/trace/${string}` {
  return tracePath(MOCK_FAILING_TRACE.chain, MOCK_FAILING_TRACE.from, MOCK_FAILING_TRACE.to);
}

export function tracePath(chain: ChainId, from: string, to: string): `/trace/${string}` {
  return `/trace/${chain}/${from}/${to}`;
}
