/**
 * Pengaturan akun.
 *
 * Selama fase frontend, fungsi di sini membaca data tiruan. Saat backend
 * siap, ganti isinya dengan pemanggilan API (asumsi kontrak: `GET /settings`
 * → `AccountSettings`) tanpa mengubah komponen yang memakainya.
 */
import { MOCK_SETTINGS } from "../mock/settings";
import type { AccountSettings } from "../types";

const MOCK_LATENCY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getAccountSettings(): Promise<AccountSettings> {
  await delay(MOCK_LATENCY_MS);
  return structuredClone(MOCK_SETTINGS);
}
