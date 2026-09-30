/** Provider metadata is returned unchanged; media rights are separate from this SDK. */
export interface GifSnapGif {
  id: string;
  title: string;
  url: string;
  preview_url: string;
  width: number;
  height: number;
  type: 'gif' | 'sticker';
  source?: string;
  /** Optional opaque identity supplied by the API for verified aliases. */
  content_id?: string;
  [key: string]: unknown;
}
export interface GifSnapPagination {
  page: number;
  limit: number;
  total: number;
  has_next: boolean;
  next_page: number | null;
  offset: number;
}
export interface GifSnapResponse {
  data: GifSnapGif[];
  pagination: GifSnapPagination;
  query?: string;
}
export interface GifSnapPageOptions { page?: number; limit?: number; signal?: AbortSignal }
export interface GifSnapSearchOptions extends GifSnapPageOptions { query: string }
export interface GifSnapClient {
  search(options: GifSnapSearchOptions): Promise<GifSnapResponse>;
  trending(options?: GifSnapPageOptions): Promise<GifSnapResponse>;
}
export interface GifSnapClientOptions { baseUrl?: string; fetch?: typeof globalThis.fetch; timeoutMs?: number }
export type GifSnapErrorCode = 'http' | 'network' | 'invalid_response' | 'timeout';
export class GifSnapError extends Error {
  readonly code: GifSnapErrorCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  constructor(message: string, details: { code: GifSnapErrorCode; status?: number; retryAfterSeconds?: number }) {
    super(message);
    this.name = 'GifSnapError';
    this.code = details.code;
    this.status = details.status;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown, min = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
const mediaUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
};
function validateResponse(value: unknown): GifSnapResponse {
  const invalid = () => new GifSnapError('GifSnap returned an invalid response.', { code: 'invalid_response' });
  if (!record(value) || !Array.isArray(value.data) || !record(value.pagination)) throw invalid();
  for (const item of value.data) {
    if (!record(item) || typeof item.id !== 'string' || !item.id || typeof item.title !== 'string' ||
      !mediaUrl(item.url) || !mediaUrl(item.preview_url) || !integer(item.width) || !integer(item.height) ||
      !['gif', 'sticker'].includes(item.type as string) || (item.source !== undefined && typeof item.source !== 'string') ||
      (item.content_id !== undefined && (typeof item.content_id !== 'string' || !item.content_id.trim()))) throw invalid();
  }
  const p = value.pagination;
  if (!integer(p.page, 1) || !integer(p.limit, 1) || p.limit > 50 || !integer(p.total) || !integer(p.offset) ||
    typeof p.has_next !== 'boolean' || (p.has_next ? !integer(p.next_page, p.page + 1) : p.next_page !== null) ||
    (value.query !== undefined && typeof value.query !== 'string')) throw invalid();
  return value as unknown as GifSnapResponse;
}
function retryDelay(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const time = Date.parse(value);
  return Number.isFinite(time) ? Math.max(0, Math.ceil((time - Date.now()) / 1000)) : undefined;
}
function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The request was aborted.', 'AbortError');
}
/** Uses the public API directly. No API key or automatic retries are added. */
export function createGifSnapClient(options: GifSnapClientOptions = {}): GifSnapClient {
  const base = new URL(options.baseUrl ?? 'https://gifsnap.com/api/v1');
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new TypeError('baseUrl must be an HTTP(S) URL without credentials, a query, or a fragment.');
  }
  const baseUrl = base.toString().replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? 15000;
  if (!integer(timeoutMs, 1) || timeoutMs > 120000) throw new RangeError('timeoutMs must be an integer from 1 to 120000.');
  async function request(endpoint: string, args: GifSnapPageOptions, query?: string): Promise<GifSnapResponse> {
    const page = args.page ?? 1, limit = args.limit ?? 24;
    if (!integer(page, 1)) throw new RangeError('page must be a positive safe integer.');
    if (!integer(limit, 1) || limit > 50) throw new RangeError('limit must be an integer from 1 to 50.');
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (query !== undefined) params.set('q', query);
    if (args.signal?.aborted) throw abortReason(args.signal);
    const fetcher = options.fetch ?? globalThis.fetch;
    if (!fetcher) throw new GifSnapError('A fetch implementation is required.', { code: 'network' });
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(abortReason(args.signal!));
    args.signal?.addEventListener('abort', forwardAbort, { once: true });
    let cancelRequest: () => void = () => {};
    const cancellation = new Promise<never>((_resolve, reject) => {
      cancelRequest = () => reject(abortReason(controller.signal));
      controller.signal.addEventListener('abort', cancelRequest, { once: true });
    });
    const timeout = setTimeout(() => controller.abort(new GifSnapError('GifSnap request timed out. Please try again.', { code: 'timeout' })), timeoutMs);
    // Cover the full response, including a stalled body reader or a custom fetch
    // that does not implement AbortSignal. Native fetch is also actively aborted.
    async function fetchResponse(): Promise<GifSnapResponse> {
      let response: Response;
      try {
        response = await fetcher(`${baseUrl}/${endpoint}?${params}`, {
          method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) throw abortReason(controller.signal);
        if (error instanceof Error && error.name === 'AbortError') throw error;
        throw new GifSnapError('Could not reach GifSnap. Check your connection and try again.', { code: 'network' });
      }
      let body: unknown;
      try { body = await response.json(); }
      catch (error) {
        if (controller.signal.aborted) throw abortReason(controller.signal);
        if (error instanceof Error && error.name === 'AbortError') throw error;
        if (response.ok) throw new GifSnapError('GifSnap returned invalid JSON.', { code: 'invalid_response' });
      }
      if (controller.signal.aborted) throw abortReason(controller.signal);
      if (!response.ok) {
        throw new GifSnapError(response.status === 429 ? 'Too many requests. Try again shortly.' : `GifSnap request failed (${response.status}).`, {
          code: 'http', status: response.status, retryAfterSeconds: retryDelay(response.headers.get('Retry-After')),
        });
      }
      return validateResponse(body);
    }
    try { return await Promise.race([fetchResponse(), cancellation]); }
    finally {
      clearTimeout(timeout);
      args.signal?.removeEventListener('abort', forwardAbort);
      controller.signal.removeEventListener('abort', cancelRequest);
    }
  }
  return {
    search(args) {
      if (typeof args?.query !== 'string' || !args.query.trim()) return Promise.reject(new TypeError('query must be a non-empty string.'));
      return request('gifs/search', args, args.query.trim());
    },
    trending(args = {}) { return request('gifs/trending', args); },
  };
}
