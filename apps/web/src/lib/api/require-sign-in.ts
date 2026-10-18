/**
 * Halaman yang isinya milik akun (pengaturan, kasus, laporan, riwayat) di
 * mode live: tanpa sesi yang sah, pengunjung diarahkan ke halaman masuk lalu
 * kembali ke halaman ini. Dipanggil dari Server Component; mode tiruan tidak
 * memeriksa apa pun.
 */
import { redirect } from "next/navigation";
import { authHref } from "../return-to";
import { ApiError, apiJson, isLive } from "./http";

export async function requireSignIn(returnTo: string): Promise<void> {
  if (!isLive()) return;
  try {
    await apiJson("/auth/session");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect(authHref("/masuk", returnTo));
    throw error;
  }
}
