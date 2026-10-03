import { type EvidenceRecord, toEvidenceView } from './evidence.view.js';
import type { ContractCheckRow, SnapshotRow } from './rows.js';
import type { CheckStatus, ContractChecksResponse } from './contract-checks.types.js';
import type { ResolvedToken } from './token-lookup.service.js';
import { toSnapshotHeader } from './token-summary.mapper.js';

/** Urutan tampil: yang bermasalah dulu supaya langsung terlihat. */
export const CHECK_STATUS_ORDER: CheckStatus[] = ['fail', 'warn', 'unknown', 'pass'];

const STANDARD_LABELS = {
  erc20: 'ERC-20',
  spl: 'SPL Token',
  spl_token_2022: 'SPL Token-2022',
} as const;

/** Urutkan menurut status; untuk status yang sama, urutan simpan dipertahankan. */
export function sortChecks<T extends Pick<ContractCheckRow, 'status' | 'id'>>(checks: T[]): T[] {
  return [...checks].sort(
    (a, b) =>
      CHECK_STATUS_ORDER.indexOf(a.status) - CHECK_STATUS_ORDER.indexOf(b.status) || a.id - b.id,
  );
}

export function countChecks(checks: Pick<ContractCheckRow, 'status'>[]) {
  return CHECK_STATUS_ORDER.map((status) => ({
    status,
    count: checks.filter((check) => check.status === status).length,
  })).filter((entry) => entry.count > 0);
}

export interface ContractChecksRows extends ResolvedToken {
  snapshot: SnapshotRow | null;
  checks: ContractCheckRow[];
  evidenceByCheck: Map<number, EvidenceRecord[]>;
}

export function toContractChecksResponse(
  rows: ContractChecksRows,
  now: Date,
  staleAfterMinutes: number,
): ContractChecksResponse {
  const { chain, token, snapshot } = rows;
  const header = snapshot ? toSnapshotHeader(snapshot, now, staleAfterMinutes) : null;

  return {
    chain: { id: chain.id, name: chain.name, supportStatus: chain.supportStatus },
    token: {
      address: rows.address,
      standard: token.standard,
      standardLabel: STANDARD_LABELS[token.standard],
    },
    snapshot: header,
    dataStatus: header?.dataStatus ?? 'unavailable',
    summary: countChecks(rows.checks),
    checks: sortChecks(rows.checks).map((check) => ({
      code: check.code,
      label: check.label,
      status: check.status,
      value: check.value,
      description: check.description,
      classification: check.classification,
      evidence: (rows.evidenceByCheck.get(check.id) ?? []).map((record) =>
        toEvidenceView(record, chain),
      ),
    })),
  };
}
