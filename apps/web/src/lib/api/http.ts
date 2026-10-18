/**
 * Klien HTTP ke API backend (`apps/api`).
 *
 * Mode data dipilih saat build lewat `NEXT_PUBLIC_DATA_MODE`: `live` memakai
 * API sungguhan, selain itu data tiruan (untuk mencoba tampilan tanpa
 * backend dan untuk tes). Di server, permintaan dikirim ke
 * `API_INTERNAL_URL` dengan cookie sesi pengguna diteruskan; di browser,
 * permintaan memakai `/api` relatif sehingga cookie HttpOnly ikut terkirim.
 */

export const DATA_MODE: "live" | "mock" = process.env.NEXT_PUBLIC_DATA_MODE === "live" ? "live" : "mock";

export function isLive(): boolean {
  return DATA_MODE === "live";
}

/** Galat dari API beserta status HTTP-nya; pesannya sudah dalam bahasa pengguna. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const isServer = typeof window === "undefined";

function baseUrl(): string {
  if (!isServer) return "/api";
  return `${(process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/+$/, "")}/api`;
}

/**
 * Cookie permintaan masuk, diteruskan ke API saat render di server. Membaca
 * cookie juga menandai halaman sebagai dinamis, jadi data live tidak pernah
 * dibekukan saat build.
 */
async function serverCookieHeader(): Promise<string | null> {
  if (!isServer) return null;
  const { cookies } = await import("next/headers");
  const header = (await cookies()).toString();
  return header === "" ? null : header;
}

async function messageOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    const message = Array.isArray(body.message) ? body.message.join(" ") : body.message;
    if (typeof message === "string" && message.trim() !== "") return message;
  } catch {
    // Bukan JSON; pakai pesan umum di bawah.
  }
  if (response.status === 401) return "Silakan masuk dulu untuk melanjutkan.";
  if (response.status >= 500) return "Layanan sedang bermasalah. Coba lagi sebentar lagi.";
  return `Permintaan gagal (HTTP ${response.status}).`;
}

export interface ApiRequest {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Dikirim sebagai JSON; `FormData` dikirim apa adanya (multipart). */
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
}

/** Kirim permintaan dan kembalikan `Response` mentah (untuk berkas, 204, dll.). */
export async function apiRaw(path: string, request: ApiRequest = {}): Promise<Response> {
  const url = new URL(`${baseUrl()}${path}`, isServer ? undefined : window.location.origin);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = { accept: "application/json" };
  const cookie = await serverCookieHeader();
  if (cookie) headers.cookie = cookie;
  let body: BodyInit | undefined;
  if (request.body instanceof FormData) body = request.body;
  else if (request.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(request.body);
  }
  try {
    return await fetch(isServer ? url.toString() : `${url.pathname}${url.search}`, {
      method: request.method ?? "GET",
      headers,
      body,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "Tidak bisa menghubungi layanan OpenChain. Periksa koneksi lalu coba lagi.");
  }
}

/** Kirim permintaan dan baca JSON; status selain 2xx dilempar sebagai `ApiError`. */
export async function apiJson<T>(path: string, request: ApiRequest = {}): Promise<T> {
  const response = await apiRaw(path, request);
  if (!response.ok) throw new ApiError(response.status, await messageOf(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Seperti `apiJson`, tapi 404 dijawab `null` (data memang tidak ada). */
export async function apiJsonOrNull<T>(path: string, request: ApiRequest = {}): Promise<T | null> {
  try {
    return await apiJson<T>(path, request);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Segmen path yang aman dipakai di URL. */
export function seg(value: string): string {
  return encodeURIComponent(value);
}
