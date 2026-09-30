import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://consumer.example/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement: h, act, StrictMode } = await import('react');
const { createRoot } = await import('react-dom/client');
const { GifPicker } = await import('../dist/index.js');
const { GifSnapError } = await import('../dist/client.js');
const roots = [];
const gif = (id, extra = {}) => ({ id, title: `GIF ${id}`, url: `https://media.example/${id}.gif`, preview_url: `https://media.example/${id}.webp`, width: 120, height: 90, type: 'gif', source: 'Tenor', provider_url: 'https://provider.example', ...extra });
const response = (ids, next = null, page = 1) => ({ data: ids.map(id => gif(id)), pagination: { page, limit: 2, total: 8, has_next: next !== null, next_page: next, offset: (page - 1) * 2 } });
function defer() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function render(props, strict = false) {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  await act(async () => root.render(strict ? h(StrictMode, null, h(GifPicker, props)) : h(GifPicker, props)));
  return container;
}
function button(container, text) { return [...container.querySelectorAll('button')].find(node => node.textContent === text); }
async function click(node) { assert.ok(node); await act(async () => node.click()); }
async function search(container, value) {
  const input = container.querySelector('input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await act(async () => container.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
}
afterEach(async () => { await act(async () => { for (const root of roots.splice(0)) root.unmount(); }); document.body.innerHTML = ''; });

test('initial trending supports labeled keyboard-native selection and full metadata', async () => {
  let selected;
  const container = await render({ onSelect: item => { selected = item; }, theme: 'dark', client: { trending: async () => response(['a']), search: async () => response([]) } });
  const input = container.querySelector('input');
  assert.equal(container.querySelector('label').htmlFor, input.id);
  assert.equal(container.querySelector('section').dataset.theme, 'dark');
  assert.doesNotMatch(container.textContent, /Source:|Tenor|Provider attribution/);
  assert.equal(container.querySelector('.gifsnap-picker__source'), null);
  assert.match(container.querySelector('a').textContent, /Powered by GifSnap/);
  assert.equal(container.querySelector('a').href, 'https://gifsnap.com/');
  await click(container.querySelector('[aria-label="Select GIF a"]'));
  assert.equal(selected.id, 'a'); assert.equal(selected.source, 'Tenor'); assert.equal(selected.provider_url, 'https://provider.example');
});

test('search aborts an in-flight request and ignores its late response', async () => {
  const old = defer(), fresh = defer(); let previousSignal, searchOptions;
  const container = await render({ onSelect() {}, client: {
    trending: args => { previousSignal = args.signal; return old.promise; },
    search: args => { searchOptions = args; return fresh.promise; },
  } });
  await search(container, 'cats');
  assert.equal(previousSignal.aborted, true);
  assert.equal(searchOptions.query, 'cats');
  await act(async () => fresh.resolve(response(['cat'])));
  await act(async () => old.resolve(response(['stale'])));
  assert.equal(container.querySelectorAll('.gifsnap-picker__card').length, 1);
  assert.match(container.textContent, /GIF cat/); assert.doesNotMatch(container.textContent, /stale/);
});

test('paging deduplicates overlap, prevents concurrent load-more, and stops at end', async () => {
  const second = defer(); const calls = [];
  const container = await render({ onSelect() {}, pageSize: 2, client: { search: async () => response([]), trending: args => { calls.push(args); return calls.length === 1 ? Promise.resolve(response(['a', 'b'], 2)) : second.promise; } } });
  const more = button(container, 'Load more');
  await click(more); await click(more);
  assert.equal(calls.length, 2); assert.equal(calls[1].page, 2); assert.equal(calls[1].limit, 2);
  await act(async () => second.resolve(response(['b', 'c'], null, 2)));
  assert.equal(container.querySelectorAll('.gifsnap-picker__card').length, 3);
  assert.equal(button(container, 'Load more'), undefined);
});

test('failed next page retains results and retries the failed page', async () => {
  const pages = []; let fail = true;
  const container = await render({ onSelect() {}, client: { search: async () => response([]), trending: async args => {
    pages.push(args.page);
    if (args.page === 1) return response(['a'], 2);
    if (fail) { fail = false; throw new GifSnapError('limited', { code: 'http', status: 429, retryAfterSeconds: 12 }); }
    return response(['b'], null, 2);
  } } });
  await click(button(container, 'Load more'));
  assert.match(container.querySelector('[role="alert"]').textContent, /12 seconds/);
  assert.equal(container.querySelectorAll('.gifsnap-picker__card').length, 1);
  await click(button(container, 'Try again'));
  assert.deepEqual(pages, [1, 2, 2]);
  assert.equal(container.querySelectorAll('.gifsnap-picker__card').length, 2);
  assert.equal(container.querySelector('[role="alert"]'), null);
});

test('initial error retries, empty search is announced, and trending reset works', async () => {
  let calls = 0;
  const container = await render({ onSelect() {}, initialQuery: 'missing', client: { trending: async () => response(['trend']), search: async () => { if (++calls === 1) throw Error('failure'); return response([]); } } });
  await click(button(container, 'Try again'));
  assert.match(container.querySelector('[role="status"]').textContent, /No GIFs found/);
  await click(button(container, 'Back to trending'));
  assert.equal(container.querySelector('input').value, ''); assert.match(container.textContent, /GIF trend/);
});

test('StrictMode cleanup and unmount cancel pending work', async () => {
  const signals = [];
  await render({ onSelect() {}, client: { search: async () => response([]), trending: args => { signals.push(args.signal); return new Promise(() => {}); } } }, true);
  assert.equal(signals.length, 2); assert.equal(signals[0].aborted, true); assert.equal(signals[1].aborted, false);
  await act(async () => roots.pop().unmount());
  assert.equal(signals[1].aborted, true);
});

test('empty and duplicate-only upstream pages terminate optimistic pagination', async () => {
  for (const secondItems of [[], ['a']]) {
    let count = 0;
    const container = await render({ onSelect() {}, client: { search: async () => response([]), trending: async () => ++count === 1 ? response(['a'], 2) : response(secondItems, 3, 2) } });
    await click(button(container, 'Load more'));
    assert.equal(container.querySelectorAll('.gifsnap-picker__card').length, 1);
    assert.equal(button(container, 'Load more'), undefined);
  }
});

test('animated URL loads first, image errors fall back once, and failed previews stay selectable', async () => {
  let selected;
  const item = gif('animated', { url: 'https://media.example/full.webp?frame=all', preview_url: 'https://media.example/thumb.webp' });
  const container = await render({ onSelect: value => { selected = value; }, client: { search: async () => response([]), trending: async () => ({ ...response([]), data: [item] }) } });
  let image = container.querySelector('img');
  assert.equal(image.getAttribute('src'), item.url);
  assert.equal(image.getAttribute('loading'), 'lazy');
  assert.equal(image.getAttribute('width'), '120');
  assert.equal(image.getAttribute('height'), '90');
  await act(async () => image.dispatchEvent(new dom.window.Event('error')));
  image = container.querySelector('img');
  assert.equal(image.getAttribute('src'), item.preview_url);
  assert.match(image.title, /Animation unavailable/);
  await act(async () => image.dispatchEvent(new dom.window.Event('error')));
  assert.equal(container.querySelector('img'), null);
  assert.match(container.textContent, /Preview unavailable/);
  await click(container.querySelector('.gifsnap-picker__card'));
  assert.equal(selected.url, item.url);
});

test('identical primary and preview URLs are never retried in an error loop', async () => {
  const item = gif('same', { preview_url: 'https://media.example/same.gif' });
  const container = await render({ onSelect() {}, client: { search: async () => response([]), trending: async () => ({ ...response([]), data: [item] }) } });
  await act(async () => container.querySelector('img').dispatchEvent(new dom.window.Event('error')));
  assert.equal(container.querySelector('img'), null);
  assert.match(container.textContent, /Preview unavailable/);
});

test('paging deduplicates exact media URLs across IDs but preserves meaningful query variants', async () => {
  const original = gif('a', { url: 'https://media.example/asset.gif?variant=1' });
  let calls = 0;
  const container = await render({ onSelect() {}, client: { search: async () => response([]), trending: async () => ++calls === 1
    ? { ...response([], 2), data: [original, gif('a-copy', { url: original.url })] }
    : { ...response([], null, 2), data: [gif('other-id', { url: original.url }), gif('variant', { url: 'https://media.example/asset.gif?variant=2' })] } } });
  assert.equal(container.querySelectorAll('.gifsnap-picker__card').length, 1);
  await click(button(container, 'Load more'));
  assert.deepEqual([...container.querySelectorAll('.gifsnap-picker__card img')].map(node => node.getAttribute('src')), [original.url, 'https://media.example/asset.gif?variant=2']);
});

test('a changed media URL for the same item resets failed-image state', async () => {
  const first = gif('same-id');
  const next = gif('same-id', { url: 'https://media.example/replacement.webp', preview_url: 'https://media.example/replacement-preview.webp' });
  const pending = defer();
  const container = await render({ onSelect() {}, client: { trending: async () => ({ ...response([]), data: [first] }), search: () => pending.promise } });
  await act(async () => container.querySelector('img').dispatchEvent(new dom.window.Event('error')));
  await search(container, 'replacement');
  await act(async () => pending.resolve({ ...response([]), data: [next] }));
  assert.equal(container.querySelector('img').getAttribute('src'), next.url);
});

test('verified content identity collapses cross-ID and cross-URL aliases while keeping first metadata', async () => {
  const original = gif('clari-1', { url: 'https://media.example/clari-1.gif', content_id: 'klipy:4941439585786859' });
  const alias = gif('klipy_4941439585786859', { url: 'https://media.example/provider-copy.webp', content_id: original.content_id });
  let selected, calls = 0;
  const container = await render({ onSelect: value => { selected = value; }, client: { search: async () => response([]), trending: async () => ++calls === 1
    ? { ...response([], 2), data: [original, alias] }
    : { ...response([], null, 2), data: [{ ...alias, id: 'third-copy', url: 'https://media.example/third-encoding.gif' }, gif('different', { content_id: 'klipy:other' }), gif('unverified-a'), gif('unverified-b')] } } });
  assert.equal(container.querySelectorAll('.gifsnap-picker__card').length, 1);
  await click(button(container, 'Load more'));
  assert.equal(container.querySelectorAll('.gifsnap-picker__card').length, 4);
  assert.deepEqual([...container.querySelectorAll('.gifsnap-picker__card img')].map(node => node.getAttribute('src')), [original.url, gif('different').url, gif('unverified-a').url, gif('unverified-b').url]);
  await click(container.querySelector('.gifsnap-picker__card'));
  assert.deepEqual(selected, original);
});

test('absent or different content identities do not collapse distinct signed/query URLs', async () => {
  const items = [
    gif('query-a', { url: 'https://media.example/asset.gif?variant=a' }),
    gif('query-b', { url: 'https://media.example/asset.gif?variant=b' }),
    gif('query-c', { url: 'https://media.example/asset.gif?variant=c', content_id: 'verified:c' }),
    gif('query-d', { url: 'https://media.example/asset.gif?variant=d', content_id: 'verified:d' }),
  ];
  const container = await render({ onSelect() {}, client: { search: async () => response([]), trending: async () => ({ ...response([]), data: items }) } });
  assert.deepEqual([...container.querySelectorAll('.gifsnap-picker__card img')].map(node => node.getAttribute('src')), items.map(item => item.url));
});
