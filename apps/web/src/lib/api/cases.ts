/**
 * Kasus investigasi tersimpan.
 *
 * Selama fase frontend, fungsi di sini membaca data tiruan. Saat backend
 * siap, ganti isinya dengan pemanggilan API (asumsi kontrak: `GET /cases` →
 * `CaseSummary[]` dan `GET /cases/:id` → `InvestigationCase`, 404 bila tidak
 * ada) tanpa mengubah komponen yang memakainya.
 */
import { canSaveFinding, planSaveToCase, summarizeCase, sortCasesByUpdated, validateCaseTitle } from "../cases";
import { validateNote } from "../history";
import { MOCK_CASES, MOCK_FAILING_CASE_ID } from "../mock/cases";
import type { CaseFinding, CaseSubject, CaseSummary, InvestigationCase } from "../types";

const MOCK_LATENCY_MS = 500;
const SAVE_LATENCY_MS = 400;
/** Isi judul atau catatan yang sengaja membuat penyimpanan tiruan gagal. */
export const MOCK_FAILING_SAVE_TEXT = "#gagal";

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

export interface SaveToCaseInput {
  target: { kind: "existing"; caseId: string } | { kind: "new"; title: string };
  subject: CaseSubject;
  findings: CaseFinding[];
  note?: string;
}

export interface SaveToCaseResult {
  caseId: string;
  caseTitle: string;
  created: boolean;
  subjectAdded: boolean;
  addedFindings: number;
  skippedFindings: number;
  noteAdded: boolean;
}

/**
 * Simpan objek dan temuan ke kasus yang ada atau kasus baru (asumsi kontrak:
 * `POST /cases` untuk kasus baru dan `POST /cases/:id/items` untuk kasus yang
 * ada, body `{ subject, findingIds, note }`; server mengambil bukti dari hash
 * temuan dan memakai snapshot data saat ini). Yang sudah ada tidak digandakan.
 * Versi tiruan tidak menyimpan permanen.
 */
export async function saveToCase(input: SaveToCaseInput): Promise<SaveToCaseResult> {
  await delay(SAVE_LATENCY_MS);
  const note = validateNote(input.note ?? "");
  if (!note.ok) throw new Error(note.error);
  if (input.findings.some((finding) => !canSaveFinding(finding))) {
    throw new Error("Ada temuan tanpa hash bukti. Temuan kasus wajib bisa ditelusuri ke transaksi.");
  }

  let target: InvestigationCase | null = null;
  let title: string;
  if (input.target.kind === "new") {
    const validation = validateCaseTitle(input.target.title);
    if (!validation.ok) throw new Error(validation.error);
    title = validation.title;
  } else {
    const { caseId } = input.target;
    if (caseId === MOCK_FAILING_CASE_ID) throw new Error("Simulasi: layanan kasus tidak bisa dihubungi.");
    target = MOCK_CASES.find((item) => item.id === caseId) ?? null;
    if (!target) throw new Error("Kasus tujuan tidak ditemukan. Mungkin sudah dihapus.");
    title = target.title;
  }
  if ([title, note.note ?? ""].some((text) => text.includes(MOCK_FAILING_SAVE_TEXT))) {
    throw new Error("Simulasi: penyimpanan ke kasus gagal karena layanan tidak bisa dihubungi.");
  }

  const plan = planSaveToCase(target, input.subject, input.findings);
  return {
    caseId: target?.id ?? `baru-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    caseTitle: title,
    created: target === null,
    subjectAdded: plan.subjectIsNew,
    addedFindings: plan.newFindings.length,
    skippedFindings: plan.duplicateFindings.length,
    noteAdded: note.note !== undefined,
  };
}
