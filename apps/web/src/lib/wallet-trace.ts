/**
 * Logika fitur Telusur Antar Wallet: merangkum jalur dan menghitung jeda
 * antar langkah.
 */
import { EMPTY_VALUE, formatAge } from "./format";
import { addressKey } from "./fund-flow";
import type { ChainId, TraceHop, WalletTrace } from "./types";

export interface TraceStep {
  hop: TraceHop;
  /** Nomor langkah, mulai dari 1. */
  number: number;
  /** Jeda dari langkah sebelumnya, mis. "38 menit"; kosong untuk langkah pertama. */
  gapText?: string;
}

export interface TraceSummary {
  hopCount: number;
  /** Lama dari langkah pertama sampai terakhir, mis. "10 hari". */
  durationText: string;
  /** Simbol aset yang berpindah, urut kemunculan. */
  assets: string[];
  /** `false` bila penerima satu langkah bukan pengirim langkah berikutnya. */
  connected: boolean;
}

/** Penerima tiap langkah harus menjadi pengirim langkah berikutnya. */
export function isConnectedPath(chain: ChainId, hops: TraceHop[]): boolean {
  return hops.every((hop, index) => index === 0 || addressKey(chain, hops[index - 1].to) === addressKey(chain, hop.from));
}

export function summarizeTrace(trace: WalletTrace): TraceSummary {
  const { hops } = trace;
  const assets: string[] = [];
  for (const hop of hops) if (!assets.includes(hop.asset.symbol)) assets.push(hop.asset.symbol);
  return {
    hopCount: hops.length,
    durationText: hops.length > 1 ? formatAge(hops[0].timestamp, hops[hops.length - 1].timestamp) : EMPTY_VALUE,
    assets,
    connected: isConnectedPath(trace.chain, hops),
  };
}

export function traceSteps(hops: TraceHop[]): TraceStep[] {
  return hops.map((hop, index) => ({
    hop,
    number: index + 1,
    gapText: index === 0 ? undefined : formatAge(hops[index - 1].timestamp, hop.timestamp),
  }));
}
