/**
 * Logika seksi Cek Kontrak: urutan tampil dan rekap status pemeriksaan.
 */
import { CHECK_STATUS_META } from "./labels";
import type { ContractCheckItem, ContractCheckStatus } from "./types";

/** Urutan tampil: yang bermasalah dulu supaya langsung terlihat. */
export const CHECK_STATUS_ORDER: ContractCheckStatus[] = ["fail", "warn", "unknown", "pass"];

/** Urutkan pemeriksaan berdasarkan status; urutan asli dipertahankan untuk status yang sama. */
export function sortContractChecks(items: ContractCheckItem[]): ContractCheckItem[] {
  return [...items].sort(
    (a, b) => CHECK_STATUS_ORDER.indexOf(a.status) - CHECK_STATUS_ORDER.indexOf(b.status),
  );
}

/** Jumlah pemeriksaan per status, hanya status yang ada isinya. */
export function countContractChecks(
  items: ContractCheckItem[],
): Array<{ status: ContractCheckStatus; count: number }> {
  return CHECK_STATUS_ORDER.map((status) => ({
    status,
    count: items.filter((item) => item.status === status).length,
  })).filter((entry) => entry.count > 0);
}

/** "1 berisiko, 3 perlu perhatian, 1 belum dicek, 4 lolos" */
export function describeContractChecks(items: ContractCheckItem[]): string {
  return countContractChecks(items)
    .map(({ status, count }) => `${count} ${CHECK_STATUS_META[status].label.toLowerCase()}`)
    .join(", ");
}
