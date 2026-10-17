import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const workflow = JSON.parse(readFileSync(new URL('../gifsnap-search.json', import.meta.url)));
const node = name => workflow.nodes.find(item => item.name === name);
const run = (name, items, query = { query: 'happy', limit: 3 }) => JSON.parse(JSON.stringify(
  vm.runInNewContext(`(function () { ${node(name).parameters.jsCode} })()`, {
    $input: { all: () => items.map(json => ({ json })), first: () => ({ json: items[0] }) },
    $: () => ({ first: () => ({ json: query }) }),
  }),
));
const validate = input => run('Validate search', [input])[0].json;
const gif = { id: 'fixture', title: 'Hello', url: 'https://media.example/hello.webp?key=a%2Fb&v=1', preview_url: 'https://media.example/still.png', width: 240, height: 180, type: 'gif', source: 'fixture', content_id: 'opaque-1' };
const response = data => ({ data, pagination: { page: 1, limit: 3, total: data.length, has_next: false, next_page: null, offset: 0 } });

test('only an explicit short query and bounded limit leave validation', () => {
  assert.deepEqual(validate({ query: '  fête + cats & dogs 😸  ', history: 'private', limit: 2 }), { query: 'fête + cats & dogs 😸', limit: 2 });
  assert.deepEqual(validate({ query: 'hello' }), { query: 'hello', limit: 3 });
});

for (const [name, input] of [
  ['missing query', {}], ['blank query', { query: '   ' }],
  ['non-string query', { query: {} }], ['long query', { query: 'a'.repeat(121) }],
  ['control characters', { query: 'hello\nworld' }],
  ['zero limit', { query: 'hello', limit: 0 }], ['large limit', { query: 'hello', limit: 11 }],
  ['fractional limit', { query: 'hello', limit: 1.5 }], ['string limit', { query: 'hello', limit: '3' }],
]) test(`rejects ${name} before a network request`, () => assert.throws(() => validate(input)));

test('rejects accidental batch requests', () => {
  assert.throws(() => run('Validate search', [{ query: 'one' }, { query: 'two' }]), /one GIF search/);
});

test('keeps full animated URLs, query strings and optional metadata', () => {
  assert.deepEqual(run('Return GIFs', [response([gif])])[0].json, { query: 'happy', ...response([gif]) });
});

test('empty results stay empty without a trending fallback', () => {
  assert.deepEqual(run('Return GIFs', [response([])])[0].json.data, []);
});

test('caps output without inventing new pagination counts', () => {
  const body = response([gif, { ...gif, id: 'other' }]);
  const result = run('Return GIFs', [body], { query: 'happy', limit: 1 })[0].json;
  assert.equal(result.data.length, 1);
  assert.deepEqual(result.pagination, body.pagination);
});

for (const [name, body] of [
  ['missing data', {}], ['invalid media URL', response([{ ...gif, url: 'javascript:alert(1)' }])],
  ['missing media', response([{ ...gif, url: undefined }])],
  ['invalid dimensions', response([{ ...gif, width: -1 }])],
  ['invalid pagination', { ...response([]), pagination: { ...response([]).pagination, has_next: true, next_page: null } }],
]) test(`rejects ${name} instead of returning a false success`, () => assert.throws(() => run('Return GIFs', [body]), /invalid response/));

test('workflow is inactive, read-only, credential-free and fixed to GifSnap search', () => {
  assert.equal(workflow.active, false);
  assert.deepEqual(workflow.pinData, {});
  const http = node('Search GifSnap');
  assert.equal(http.parameters.method, 'GET');
  assert.equal(http.parameters.url, 'https://gifsnap.com/api/v1/gifs/search');
  assert.deepEqual(http.parameters.queryParameters.parameters.map(p => p.name), ['q', 'page', 'limit']);
  assert.equal(http.parameters.options.timeout, 15000);
  assert.equal(http.parameters.options.redirect.redirect.followRedirects, false);
  assert.equal(http.retryOnFail, false);
  assert.equal(http.onError, 'stopWorkflow');
  assert.equal(workflow.settings.callerPolicy, 'workflowsFromSameOwner');
  assert.ok(workflow.nodes.every(n => !n.credentials));
  const allowed = new Set(['manualTrigger', 'executeWorkflowTrigger', 'set', 'code', 'httpRequest', 'stickyNote'].map(n => `n8n-nodes-base.${n}`));
  assert.ok(workflow.nodes.every(n => allowed.has(n.type)));
});
