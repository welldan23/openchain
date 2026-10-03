import { fakeFetch, jsonResponse, textResponse } from '../../test/support/fake-fetch.js';
import { HttpStatusError } from './http-client.js';
import { ProviderError } from './provider.types.js';

const request = { provider: 'contoh', url: 'https://api.contoh.test/data' };

describe('HttpClient', () => {
  it('mengulang saat kena batas rate dan mengikuti Retry-After', async () => {
    const fake = fakeFetch([jsonResponse({}, 429, { 'retry-after': '2' }), jsonResponse({ ok: true })]);
    await expect(fake.http.requestJson(request)).resolves.toEqual({ ok: true });
    expect(fake.requests).toHaveLength(2);
    expect(fake.sleeps).toEqual([2000]);
  });

  it('memakai jeda yang makin panjang untuk error server', async () => {
    const fake = fakeFetch([jsonResponse({}, 503), jsonResponse({}, 502), jsonResponse({ ok: true })]);
    await expect(fake.http.requestJson(request)).resolves.toEqual({ ok: true });
    expect(fake.sleeps).toEqual([500, 1000]);
  });

  it('berhenti setelah batas percobaan ulang', async () => {
    const fake = fakeFetch([jsonResponse({}, 500), jsonResponse({}, 500), jsonResponse({}, 500), jsonResponse({}, 500)]);
    const error = await fake.http.requestJson(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpStatusError);
    expect((error as HttpStatusError).status).toBe(500);
    expect((error as HttpStatusError).reason).toBe('HTTP 500: server provider bermasalah');
    expect(fake.requests).toHaveLength(4);
    expect(fake.sleeps).toEqual([500, 1000, 2000]);
  });

  it('tidak mengulang status yang bukan gangguan sementara', async () => {
    const fake = fakeFetch([jsonResponse({ message: 'Not found' }, 404)]);
    await expect(fake.http.requestJson(request)).rejects.toMatchObject({
      status: 404,
      reason: 'HTTP 404: data tidak ditemukan (Not found)',
    });
    expect(fake.requests).toHaveLength(1);
  });

  it('mengenali halaman tantangan Cloudflare', async () => {
    const fake = fakeFetch([textResponse('<html><head><title>Just a moment...</title></head></html>', 403)]);
    await expect(fake.http.requestJson(request)).rejects.toMatchObject({
      reason: 'HTTP 403: diblokir proteksi bot (Cloudflare)',
    });
  });

  it('melaporkan timeout dan mengulangnya', async () => {
    const timeout = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    const fake = fakeFetch([timeout(), timeout(), timeout(), timeout()]);
    await expect(fake.http.requestJson({ ...request, timeoutMs: 8000 })).rejects.toMatchObject({
      reason: 'Tidak ada respons dalam 8 detik',
    });
    expect(fake.requests).toHaveLength(4);
  });

  it('menyebut kode gangguan koneksi tanpa nama host', async () => {
    const failure = new TypeError('fetch failed', {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.contoh.test'), { code: 'ENOTFOUND' }),
    });
    const fake = fakeFetch([failure, failure, failure, failure]);
    const error = (await fake.http.requestJson(request).catch((caught: unknown) => caught)) as ProviderError;
    expect(error.reason).toBe('Koneksi gagal (ENOTFOUND)');
    expect(error.message).not.toContain('api.contoh.test');
  });

  it('tidak pernah memasukkan URL atau API key ke pesan error', async () => {
    const fake = fakeFetch([textResponse('denied', 401)]);
    const error = (await fake.http
      .requestJson({
        provider: 'rpc-rahasia',
        url: 'https://rpc.contoh.test/v2/KUNCI-RAHASIA-123',
        headers: { authorization: 'Bearer TOKEN-RAHASIA-456' },
      })
      .catch((caught: unknown) => caught)) as ProviderError;
    expect(error.reason).toBe('HTTP 401: akses ditolak, API key tidak valid');
    for (const secret of ['KUNCI-RAHASIA-123', 'TOKEN-RAHASIA-456', 'rpc.contoh.test']) {
      expect(error.message).not.toContain(secret);
      expect(String(error.stack)).not.toContain(secret);
    }
  });

  it('menyertakan pesan provider yang sudah dibersihkan', async () => {
    const fake = fakeFetch([
      jsonResponse(
        {
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Archive requests require a personal token. Get one at: https://www.allnodes.com/publicnode',
          },
        },
        403,
      ),
      jsonResponse({ error: 'Invalid API key KUNCIRAHASIAabcdefghijklmnop123' }, 401),
    ]);
    await expect(fake.http.requestJson(request)).rejects.toMatchObject({
      reason: 'HTTP 403: akses ditolak (Archive requests require a personal token. Get one at: [url])',
    });
    await expect(fake.http.requestJson(request)).rejects.toMatchObject({
      reason: 'HTTP 401: akses ditolak, API key tidak valid (Invalid API key [disensor])',
    });
  });

  it('mengirim body JSON dengan header yang benar', async () => {
    const fake = fakeFetch([jsonResponse({ ok: true })]);
    await fake.http.requestJson({ ...request, method: 'POST', body: { halo: 1 }, headers: { 'x-satu': 'a' } });
    expect(fake.requests[0]).toMatchObject({
      method: 'POST',
      body: { halo: 1 },
      headers: { accept: 'application/json', 'content-type': 'application/json', 'x-satu': 'a' },
    });
  });

  it('menolak respons yang bukan JSON tanpa mengulang', async () => {
    const fake = fakeFetch([new Response('bukan json', { status: 200 })]);
    await expect(fake.http.requestJson(request)).rejects.toMatchObject({ reason: 'Respons bukan JSON yang valid' });
    expect(fake.requests).toHaveLength(1);
  });
});
