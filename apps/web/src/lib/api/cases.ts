/**
 * Kasus investigasi tersimpan.
 *
 * Selama fase frontend, fungsi di sini membaca data tiruan. Saat backend
 * siap, ganti isinya dengan pemanggilan API (asumsi kontrak: `GET /cases` →
 * `CaseSummary[]` dan `GET /cases/:id` → `InvestigationCase`, 404 bila tidak
 * ada) tanpa mengubah komponen yang memakainya.
 */
import { summarizeCase, sortCasesByUpdated } from "../cases";
import { MOCK_CASES, MOCK_FAILING_CASE_ID } from "../mock/cases";
import type { CaseSummary, InvestigationCase } from "../types";

const MOCK_LATENCY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Semua kasus, terbaru diperbarui di atas. */
export async function listCases(): Promise<CaseSummary[]> {
  await delay(MOCK_LATENCY_MS);
  return sortCasesByUpdated(MOCK_CASES.map(summarizeCase));
}

/** Satu kasus lengkap; `null` bila tidak ada. */
export async function getCase(id: string): Promise<InvestigationCase | null> {
  await delay(MOCK_LATENCY_MS);
  if (id === MOCK_FAILING_CASE_ID) throw new Error("Simulasi: layanan kasus tidak bisa dihubungi.");
  return MOCK_CASES.find((item) => item.id === id) ?? null;
}

export function casePath(id: string): string {
  return `/kasus/${encodeURIComponent(id)}`;
}

export function caseFailureDemoPath(): string {
  return casePath(MOCK_FAILING_CASE_ID);
}
