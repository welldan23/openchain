/**
 * Bentuk bukti yang dikirim ke frontend. Dipakai ulang oleh semua endpoint
 * yang menampilkan bukti (cek kontrak, temuan risiko, bukti transaksi).
 */
import type { InfoClassification } from '../database/schema/enums.js';
import { numericToNumber } from '../common/units.js';
import type { ChainRow, EvidenceRow } from './rows.js';

export interface EvidenceView {
  classification: InfoClassification;
  /** Penjelasan yang mudah dibaca. */
  explanation: string;
  txHash: string | null;
  blockNumber: number | null;
  blockTimestamp: string | null;
  logIndex: number | null;
  sourceAddress: string | null;
  destinationAddress: string | null;
  contractAddress: string | null;
  asset: string | null;
  /** Jumlah mentah (satuan terkecil). */
  amountRaw: string | null;
  method: string | null;
  heuristicName: string | null;
  confidence: number | null;
  fetchedAt: string;
  /** Tautan transaksi di explorer; kosong bila chain belum punya explorer. */
  explorerUrl: string | null;
}

/** Baris bukti beserta address yang sudah di-join. */
export interface EvidenceRecord {
  evidence: EvidenceRow;
  sourceAddress: string | null;
  destinationAddress: string | null;
  contractAddress: string | null;
}

/** URL transaksi di explorer chain. Format `/tx/<hash>` dipakai explorer EVM dan Solscan. */
export function explorerTxUrl(chain: ChainRow, txHash: string | null): string | null {
  if (!chain.explorerUrl || !txHash) return null;
  return `${chain.explorerUrl.replace(/\/+$/, '')}/tx/${txHash}`;
}

export function toEvidenceView(record: EvidenceRecord, chain: ChainRow): EvidenceView {
  const { evidence } = record;
  return {
    classification: evidence.classification,
    explanation: evidence.explanation,
    txHash: evidence.txHash,
    blockNumber: evidence.blockNumber,
    blockTimestamp: evidence.blockTimestamp?.toISOString() ?? null,
    logIndex: evidence.logIndex,
    sourceAddress: record.sourceAddress,
    destinationAddress: record.destinationAddress,
    contractAddress: record.contractAddress,
    asset: evidence.asset,
    amountRaw: evidence.amountRaw,
    method: evidence.method,
    heuristicName: evidence.heuristicName,
    confidence: numericToNumber(evidence.confidence),
    fetchedAt: evidence.fetchedAt.toISOString(),
    explorerUrl: explorerTxUrl(chain, evidence.txHash),
  };
}
