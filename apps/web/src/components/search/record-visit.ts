import { recordInvestigation, type NewInvestigationEntry } from "@/lib/api/search";

/**
 * Catat investigasi yang dibuka ke riwayat tanpa menahan navigasi. Bila
 * pencatatan gagal, halaman tetap terbuka; yang hilang hanya satu baris
 * riwayat, jadi kegagalan cukup dicatat di console.
 */
export function recordVisit(entry: NewInvestigationEntry): void {
  recordInvestigation(entry).catch((cause: unknown) => {
    console.warn("Riwayat investigasi gagal dicatat", cause);
  });
}
