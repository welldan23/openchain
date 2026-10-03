import { HttpClient, type FetchLike } from '../../src/providers/http-client.js';

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export type Reply = Response | Error | ((request: RecordedRequest) => Response | Promise<Response>);

/**
 * `fetch` palsu untuk tes provider: membalas dari antrean dan mencatat setiap
 * request. Tidak ada request jaringan sungguhan.
 */
export function fakeFetch(replies: Reply[] = [], fallback?: (request: RecordedRequest) => Response) {
  const queue = [...replies];
  const requests: RecordedRequest[] = [];
  const sleeps: number[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const request: RecordedRequest = {
      url,
      method: init.method ?? 'GET',
      headers: { ...(init.headers as Record<string, string>) },
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    const reply = queue.shift() ?? fallback;
    if (reply === undefined) throw new Error(`Tidak ada balasan palsu untuk request ke-${requests.length}`);
    if (reply instanceof Error) throw reply;
    return typeof reply === 'function' ? reply(request) : reply;
  };
  const http = new HttpClient(fetchImpl, async (ms) => {
    sleeps.push(ms);
  });
  return {
    http,
    requests,
    sleeps,
    push: (...more: Reply[]) => queue.push(...more),
  };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function textResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html' } });
}

/** Balasan JSON-RPC sukses untuk id request yang sama. */
export function rpcResult(result: unknown): (request: RecordedRequest) => Response {
  return (request) => jsonResponse({ jsonrpc: '2.0', id: (request.body as { id: number }).id, result });
}

/** Balasan error JSON-RPC. */
export function rpcError(code: number, message: string): (request: RecordedRequest) => Response {
  return (request) => jsonResponse({ jsonrpc: '2.0', id: (request.body as { id: number }).id, error: { code, message } });
}
