/** Bukti transaksi tersimpan (`/api/transactions/:chain/:hash`) dalam bentuk modal bukti frontend. */
import type { ChainId, TxEvidence } from "../../types";
import { apiJsonOrNull, seg } from "../http";
import { toEntityLabel, toNumber, type ApiLabel } from "./common";
import { toFlowAsset, type ApiFlowAsset } from "./flows";

/** Hash yang rinciannya diambil per halaman; sisanya tetap bisa dibuka di explorer. */
export const MAX_EVIDENCE_DETAILS = 25;

export interface ApiTxEvidence {
  txHash: string;
  timestamp: string;
  movements: Array<{ from: { address: string; labels: ApiLabel[] }; to: { address: string; labels: ApiLabel[] }; asset: ApiFlowAsset; amount: string | null; amountUsd: number | null }>;
}

export function toTxEvidence(chain: ChainId, evidence: ApiTxEvidence): TxEvidence {
  return {
    chain,
    txHash: evidence.txHash,
    timestamp: evidence.timestamp,
    movements: evidence.movements.map((movement) => ({
      from: movement.from.address,
      fromLabel: toEntityLabel(movement.from.labels[0]),
      to: movement.to.address,
      toLabel: toEntityLabel(movement.to.labels[0]),
      asset: toFlowAsset(movement.asset),
      amount: toNumber(movement.amount) ?? Number.NaN,
      ...(movement.amountUsd === null ? {} : { amountUsd: movement.amountUsd }),
    })),
  };
}

/** Rincian hash yang tersimpan; hash yang belum tercatat dilewati (dibuka lewat explorer), tidak dikarang. */
export async function fetchTxEvidence(items: Array<{ chain: ChainId; txHash: string }>): Promise<TxEvidence[]> {
  const unique = [...new Map(items.map((item) => [`${item.chain}:${item.txHash.toLowerCase()}`, item])).values()].slice(0, MAX_EVIDENCE_DETAILS);
  const found = await Promise.all(
    unique.map(async (item) => {
      const evidence = await apiJsonOrNull<ApiTxEvidence>(`/transactions/${seg(item.chain)}/${seg(item.txHash)}`).catch(() => null);
      return evidence ? toTxEvidence(item.chain, evidence) : null;
    }),
  );
  return found.filter((item) => item !== null);
}
