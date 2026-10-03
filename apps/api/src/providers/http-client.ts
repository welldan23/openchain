/**
 * Klien HTTP untuk provider: timeout, retry untuk gangguan sementara, dan
 * pesan error yang aman disimpan. URL dan header tidak pernah masuk ke pesan
 * error, karena URL RPC atau header bisa berisi API key.
 */
import { ProviderError } from './provider.types.js';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;

export interface JsonRequest {
  /** Nama provider untuk pesan error, mis. `blockscout`. */
  provider: string;
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  /** Dikirim sebagai JSON. */
  body?: unknown;
  timeoutMs?: number;
  /** Percobaan ulang untuk HTTP 429, 5xx, timeout, dan gangguan koneksi. */
  retries?: number;
}

/** Provider membalas dengan status HTTP gagal. */
export class HttpStatusError extends ProviderError {
  constructor(
    provider: string,
    readonly status: number,
    reason: string,
  ) {
    super(provider, reason);
    this.name = 'HttpStatusError';
  }
}

export const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 3;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 5_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

type Attempt =
  | { ok: true; value: unknown }
  | { ok: false; error: ProviderError; retryable: boolean; retryAfterMs?: number };

export class HttpClient {
  constructor(
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
    private readonly sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async requestJson<T>(request: JsonRequest): Promise<T> {
    const retries = request.retries ?? DEFAULT_RETRIES;
    for (let attempt = 0; ; attempt++) {
      const outcome = await this.attempt(request);
      if (outcome.ok) return outcome.value as T;
      if (!outcome.retryable || attempt >= retries) throw outcome.error;
      await this.sleep(outcome.retryAfterMs ?? Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS));
    }
  }

  private async attempt(request: JsonRequest): Promise<Attempt> {
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const headers: Record<string, string> = { accept: 'application/json', ...request.headers };
    if (request.body !== undefined) headers['content-type'] = 'application/json';

    let status: number;
    let retryAfter: string | null;
    let text: string;
    try {
      const response = await this.fetchImpl(request.url, {
        method: request.method ?? 'GET',
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
      retryAfter = response.headers.get('retry-after');
      text = await response.text();
    } catch (error) {
      return { ok: false, retryable: true, error: new ProviderError(request.provider, describeNetworkError(error, timeoutMs)) };
    }

    if (status < 200 || status >= 300) {
      return {
        ok: false,
        retryable: RETRYABLE_STATUS.has(status),
        retryAfterMs: parseRetryAfter(retryAfter),
        error: new HttpStatusError(request.provider, status, describeStatus(status, text)),
      };
    }
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch {
      return { ok: false, retryable: false, error: new ProviderError(request.provider, 'Respons bukan JSON yang valid') };
    }
  }
}

/** Alasan gangguan jaringan tanpa menyebut URL atau host. */
export function describeNetworkError(error: unknown, timeoutMs: number): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') {
    return `Tidak ada respons dalam ${Math.round(timeoutMs / 1000)} detik`;
  }
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  const code = cause?.code ?? (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? `Koneksi gagal (${code})` : 'Koneksi gagal';
}

/**
 * Alasan status HTTP gagal dalam bahasa sehari-hari, ditambah pesan singkat
 * dari provider bila ada (mis. "Archive requests require a personal token").
 */
export function describeStatus(status: number, body: string): string {
  if (status === 403 && /just a moment|challenge-platform|cf-chl/i.test(body)) {
    return 'HTTP 403: diblokir proteksi bot (Cloudflare)';
  }
  let reason: string;
  if (status === 401) reason = 'HTTP 401: akses ditolak, API key tidak valid';
  else if (status === 402) reason = 'HTTP 402: butuh API key';
  else if (status === 403) reason = 'HTTP 403: akses ditolak';
  else if (status === 404) reason = 'HTTP 404: data tidak ditemukan';
  else if (status === 429) reason = 'HTTP 429: kena batas rate provider';
  else if (status >= 500) reason = `HTTP ${status}: server provider bermasalah`;
  else reason = `HTTP ${status}`;
  const detail = providerMessage(body);
  return detail ? `${reason} (${detail})` : reason;
}

/** Pesan error JSON dari provider, tanpa URL dan dipendekkan. */
function providerMessage(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const record = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const nested = record.error !== null && typeof record.error === 'object' ? (record.error as Record<string, unknown>) : {};
  const message = [nested.message, record.message, record.error].find((value) => typeof value === 'string');
  if (typeof message !== 'string') return null;
  const cleaned = sanitizeProviderText(message, 120);
  return cleaned === '' ? null : cleaned;
}

/**
 * Bersihkan teks dari provider sebelum disimpan atau ditampilkan: URL diganti
 * `[url]`, dan deretan karakter panjang (bisa berupa API key yang disalin
 * provider ke pesan error) diganti `[disensor]`.
 */
export function sanitizeProviderText(text: string, maxLength: number): string {
  return text
    .replace(/https?:\/\/\S+/g, '[url]')
    .replace(/[A-Za-z0-9_-]{24,}/g, '[disensor]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** `Retry-After` dalam detik; dibatasi supaya tidak menunggu terlalu lama. */
function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  return Math.min(Number(value) * 1000, MAX_BACKOFF_MS);
}
