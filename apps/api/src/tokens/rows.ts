/** Tipe baris database yang dipakai modul tokens. */
import type {
  chains,
  contractChecks,
  evidence,
  providerRuns,
  tokens,
  tokenSnapshots,
} from '../database/schema/index.js';

export type ChainRow = typeof chains.$inferSelect;
export type TokenRow = typeof tokens.$inferSelect;
export type SnapshotRow = typeof tokenSnapshots.$inferSelect;
export type ProviderRunRow = typeof providerRuns.$inferSelect;
export type EvidenceRow = typeof evidence.$inferSelect;
export type ContractCheckRow = typeof contractChecks.$inferSelect;
