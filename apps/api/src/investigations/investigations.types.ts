/** Kontrak `/api/investigations`: riwayat halaman investigasi yang pernah dibuka. */
import type { InvestigationKind } from '../database/schema/enums.js';

export interface InvestigationEntryView {
  /** Id sebagai string, sama seperti di frontend. */
  id: string;
  kind: InvestigationKind;
  title: string;
  chain: string | null;
  href: string;
  /** Terakhir dibuka. */
  openedAt: string;
  firstOpenedAt: string;
  openCount: number;
  /** Catatan singkat user; `null` bila belum ada. */
  note: string | null;
  /** Jumlah temuan saat terakhir dibuka; `null` bila tidak diketahui. */
  findingCount: number | null;
}

export interface InvestigationListResponse {
  entries: InvestigationEntryView[];
  /** Jumlah seluruh riwayat (dengan filter jenis), sebelum dibatasi `limit`. */
  total: number;
  limit: number;
}

/** Isi `POST /api/investigations`. */
export interface NewInvestigationInput {
  kind: InvestigationKind;
  title: string;
  chain: string | null;
  href: string;
  note: string | null;
  findingCount: number | null;
}
