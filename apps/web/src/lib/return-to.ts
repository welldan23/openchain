/**
 * Alamat kembali setelah masuk/daftar (`?lanjut=`). Hanya path internal
 * yang diterima supaya tautan masuk tidak bisa dipakai untuk mengarahkan
 * orang ke situs lain.
 */
export const RETURN_PARAM = "lanjut";
export const DEFAULT_RETURN = "/pengaturan/profil";
const MAX_LENGTH = 500;
const AUTH_PAGES = ["/masuk", "/daftar"];

export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || raw.length > MAX_LENGTH) return DEFAULT_RETURN;
  // Harus diawali satu "/", bukan "//" atau "/\" (dibaca browser sebagai alamat situs lain).
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_RETURN;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_RETURN;
  let url: URL;
  try {
    url = new URL(raw, "https://openchain.invalid");
  } catch {
    return DEFAULT_RETURN;
  }
  if (url.origin !== "https://openchain.invalid") return DEFAULT_RETURN;
  // Kembali ke halaman masuk/daftar hanya membuat putaran.
  if (AUTH_PAGES.includes(url.pathname)) return DEFAULT_RETURN;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Tautan ke halaman masuk/daftar yang membawa alamat kembali. */
export function authHref(page: "/masuk" | "/daftar", returnTo: string | null | undefined): string {
  const safe = safeReturnPath(returnTo);
  return safe === DEFAULT_RETURN ? page : `${page}?${RETURN_PARAM}=${encodeURIComponent(safe)}`;
}
