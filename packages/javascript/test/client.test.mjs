import test from 'node:test';
import assert from 'node:assert/strict';
import { createGifSnapClient, GifSnapError } from '../dist/index.js';

const gif = { id: 'one', title: 'Hello', url: 'https://media.example/one.webp', preview_url: 'https://media.example/preview.webp', width: 200, height: 160, type: 'gif', source: 'tenor', provider_url: 'https://provider.example/item' };
const body = (overrides = {}) => ({ data: [gif], pagination: { page: 1, limit: 24, total: 1, has_next: false, next_page: null, offset: 0 }, ...overrides });
const json = (data, options) => new Response(JSON.stringify(data), options);
const assertCode = (code, status) => error => error instanceof GifSnapError && error.code === code && (status === undefined || error.status === status);

test('search encodes query, follows explicit page, omits credentials and preserves provider metadata', async () => {
  let seen;
  const client = createGifSnapClient({ baseUrl: 'https://example.test/api/v1/', fetch: async (...args) => { seen = args; return json(body({ query: 'cats & dogs' })); } });
  const result = await client.search({ query: ' cats & dogs ', page: 2, limit: 12 });
  const url = new URL(seen[0]);
  assert.equal(url.pathname, '/api/v1/gifs/search');
  assert.equal(url.searchParams.get('q'), 'cats & dogs');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('limit'), '12');
  assert.equal(seen[1].credentials, 'omit');
  assert.equal(seen[1].headers.Accept, 'application/json');
  assert.equal(result.data[0].provider_url, gif.provider_url);
  assert.equal(result.data[0].url.endsWith('.webp'), true);
});

test('trending defaults and next-page contract', async () => {
  const paths = [];
  const client = createGifSnapClient({ fetch: async url => {
    paths.push(new URL(url));
    const page = Number(paths.at(-1).searchParams.get('page'));
    return json(body({ pagination: { page, limit: 24, total: 25, has_next: page === 1, next_page: page === 1 ? 2 : null, offset: (page - 1) * 24 } }));
  } });
  const first = await client.trending();
  const second = await client.trending({ page: first.pagination.next_page });
  assert.equal(paths[0].origin + paths[0].pathname, 'https://gifsnap.com/api/v1/gifs/trending');
  assert.equal(paths[0].searchParams.get('limit'), '24');
  assert.equal(paths[0].searchParams.has('q'), false);
  assert.equal(second.pagination.has_next, false);
  assert.equal(second.pagination.next_page, null);
});

test('rejects invalid arguments before fetching', async () => {
  let calls = 0;
  const client = createGifSnapClient({ fetch: async () => { calls++; return json(body()); } });
  for (const page of [0, -1, 1.5, NaN, Infinity]) await assert.rejects(client.trending({ page }), RangeError);
  for (const limit of [0, 51, -1, 1.5, NaN]) await assert.rejects(client.trending({ limit }), RangeError);
  await assert.rejects(client.search({ query: '   ' }), TypeError);
  assert.equal(calls, 0);
  for (const baseUrl of ['javascript:alert(1)', 'https://user:pass@example.test', 'https://example.test?q=1', 'https://example.test/#secret']) assert.throws(() => createGifSnapClient({ baseUrl }), TypeError);
});

test('rejects malformed and unsafe successful responses', async () => {
  const invalid = [null, { data: [], pagination: null }, body({ data: [{ ...gif, url: 'javascript:alert(1)' }] }), body({ data: [{ ...gif, source: null }] }), body({ data: [{ ...gif, width: -1 }] }), body({ pagination: { page: 1, limit: 24, total: 2, has_next: true, next_page: 1, offset: 0 } })];
  for (const value of invalid) await assert.rejects(createGifSnapClient({ fetch: async () => json(value) }).trending(), assertCode('invalid_response'));
  await assert.rejects(createGifSnapClient({ fetch: async () => new Response('<html>proxy error</html>') }).trending(), assertCode('invalid_response'));
});

test('HTTP and network failures expose safe typed errors without automatic retries', async () => {
  let calls = 0;
  for (const status of [400, 500, 503]) await assert.rejects(createGifSnapClient({ fetch: async () => { calls++; return new Response('private upstream data', { status }); } }).trending(), error => assertCode('http', status)(error) && !error.message.includes('private'));
  assert.equal(calls, 3);
  await assert.rejects(createGifSnapClient({ fetch: async () => { throw new TypeError('fetch failed'); } }).trending(), assertCode('network'));
});

test('429 exposes Retry-After seconds and HTTP dates', async () => {
  for (const header of ['12', new Date(Date.now() + 60000).toUTCString()]) {
    await assert.rejects(createGifSnapClient({ fetch: async () => json({ error: 'limited' }, { status: 429, headers: { 'Retry-After': header } }) }).trending(), error => assertCode('http', 429)(error) && Number.isInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0);
  }
});

test('pre-aborted request never fetches and active cancellation preserves AbortError', async () => {
  const already = new AbortController(); already.abort();
  let calls = 0;
  const client = createGifSnapClient({ fetch: async (_url, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  await assert.rejects(client.trending({ signal: already.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
  const active = new AbortController();
  const pending = client.trending({ signal: active.signal }); active.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('aborting while body is read never returns stale data', async () => {
  const controller = new AbortController();
  const client = createGifSnapClient({ fetch: async () => ({ ok: true, json: async () => { controller.abort(); return body(); } }) });
  await assert.rejects(client.trending({ signal: controller.signal }), { name: 'AbortError' });
});

test('optional source is accepted and missing metadata is not invented', async () => {
  const { source, ...withoutSource } = gif;
  const result = await createGifSnapClient({ fetch: async () => json(body({ data: [withoutSource] })) }).trending();
  assert.equal(result.data[0].source, undefined);
});

test('timeout bounds stalled fetch and body, aborts fetch, and preserves custom external reason', async () => {
  for (const bodyStalls of [false, true]) {
    let signal;
    const client = createGifSnapClient({ timeoutMs: 10, fetch: async (_url, options) => {
      signal = options.signal;
      return bodyStalls ? { ok: true, json: () => new Promise(() => {}) } : new Promise(() => {});
    } });
    await assert.rejects(client.trending(), assertCode('timeout'));
    assert.equal(signal.aborted, true);
  }
  const controller = new AbortController();
  const reason = new Error('Consumer navigation');
  const client = createGifSnapClient({ timeoutMs: 1000, fetch: async () => new Promise(() => {}) });
  const request = client.trending({ signal: controller.signal });
  controller.abort(reason);
  await assert.rejects(request, error => error === reason);
  for (const timeoutMs of [0, -1, NaN, Infinity, 120001]) assert.throws(() => createGifSnapClient({ timeoutMs }), RangeError);
});

test('optional verified content identity is validated and preserved without rewriting records or counts', async () => {
  const records = [
    { ...gif, content_id: 'klipy:4941439585786859' },
    { ...gif, id: 'another-id', url: 'https://media.example/alternate.gif', content_id: 'klipy:4941439585786859' },
    { ...gif, id: 'without-identity', url: 'https://media.example/unverified.gif' },
  ];
  const result = await createGifSnapClient({ fetch: async () => json(body({ data: records })) }).trending();
  assert.deepEqual(result.data, records);
  assert.equal(result.data.length, 3);
  assert.equal(Object.hasOwn(result.data[2], 'content_id'), false);
  for (const content_id of [null, 123, {}, [], '', '   ']) {
    await assert.rejects(createGifSnapClient({ fetch: async () => json(body({ data: [{ ...gif, content_id }] })) }).trending(), assertCode('invalid_response'));
  }
});

test('sticker methods use explicit routes and retain exact animated URLs and unknown provider metadata', async () => {
  const calls = [];
  const sticker = { ...gif, type: 'sticker', url: 'https://media.example/full.webp?token=exact&v=2', content_id: 'provider:opaque' };
  const client = createGifSnapClient({ fetch: async (url, options) => { calls.push({ url: new URL(url), options }); return json(body({ data: [sticker] })); } });
  assert.deepEqual((await client.searchStickers({ query: ' hello ', page: 3, limit: 2 })).data[0], sticker);
  await client.trendingStickers();
  assert.equal(calls[0].url.pathname, '/api/v1/stickers/search');
  assert.equal(calls[0].url.searchParams.get('q'), 'hello');
  assert.equal(calls[0].url.searchParams.get('page'), '3');
  assert.equal(calls[1].url.pathname, '/api/v1/stickers/trending');
  assert.equal(calls[1].url.searchParams.has('q'), false);
  await assert.rejects(client.searchStickers({ query: '' }), TypeError);
  assert.equal(calls.length, 2);
});
