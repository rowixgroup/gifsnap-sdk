// Run inside the pinned n8n Docker image with --network none. No live API calls.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const template = JSON.parse(await readFile(new URL('../gifsnap-search.json', import.meta.url), 'utf8'));
const tmp = '/tmp/gifsnap-n8n-test';
await mkdir(tmp, { recursive: true });
const env = { ...process.env, N8N_USER_FOLDER: `${tmp}/user`, N8N_DIAGNOSTICS_ENABLED: 'false', N8N_VERSION_NOTIFICATIONS_ENABLED: 'false', N8N_TEMPLATES_ENABLED: 'false', N8N_PERSONALIZATION_ENABLED: 'false' };
const cli = async args => {
  try { return (await exec('n8n', args, { env, maxBuffer: 8 * 1024 * 1024, timeout: 100000 })).stdout; }
  catch (error) {
    if (args[0] === 'execute' && error.stdout?.includes('"resultData"')) return error.stdout;
    throw new Error(`n8n ${args[0]} failed: ${(error.stderr || error.message).slice(-1500)}`);
  }
};

const requests = [];
const media = { id: 'fixture-1', title: 'Hello', url: 'https://media.example/hello.webp?key=a%2Fb&v=1', preview_url: 'https://media.example/hello.png', width: 240, height: 180, type: 'gif', source: 'fixture', content_id: 'opaque-1' };
const server = createServer(async (req, res) => {
  let rawBody = '';
  for await (const chunk of req) rawBody += chunk;
  const url = new URL(req.url, 'http://127.0.0.1');
  const query = url.searchParams.get('q');
  requests.push({ method: req.method, path: url.pathname, params: Object.fromEntries(url.searchParams), body: rawBody, authorization: req.headers.authorization });
  if (url.pathname !== '/api/v1/gifs/search') { res.writeHead(404).end(); return; }
  if (query === 'slow') return; // Deliberately leave headers pending to exercise the actual timeout.
  if (query === 'rate limited') { res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' }).end('{"error":"fixture rate limit"}'); return; }
  if (query === 'bad json') { res.writeHead(200, { 'Content-Type': 'application/json' }).end('not json'); return; }
  if (!['happy', 'empty', 'fête + cats & dogs 😸', 'malformed'].includes(query)) { res.writeHead(500).end('Unexpected fixture query'); return; }
  const data = query === 'empty' ? [] : [{ ...media }];
  if (query === 'malformed') delete data[0].url;
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data, pagination: { page: 1, limit: Number(url.searchParams.get('limit')), total: data.length, has_next: false, next_page: null, offset: 0 }, query }));
});
await new Promise(resolve => server.listen(8787, '127.0.0.1', resolve));

// The server CLI emits lifecycle logs around JSON; inspect actual execution data,
// not just the process status (the CLI can catch errors without a nonzero exit).
function executionData(text) {
  for (const match of text.matchAll(/(?:^|\n)\{/g)) {
    const start = match.index + (match[0].startsWith('\n') ? 1 : 0);
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        const value = JSON.parse(text.slice(start, i + 1));
        if (value.data?.resultData) return value;
        break;
      }
    }
  }
  throw new Error(`No execution result found: ${text.slice(-2500)}`);
}

const cases = [
  { name: 'manual search', query: 'happy', manual: true },
  { name: 'sub-workflow input and Unicode encoding', query: '  fête + cats & dogs 😸  ', limit: 2 },
  { name: 'empty results remain empty', query: 'empty', empty: true },
  { name: 'missing query stops before HTTP', query: null, error: /query must/, requestCount: 0 },
  { name: 'malformed response fails', query: 'malformed', error: /invalid response/ },
  { name: 'HTTP 429 fails without retry', query: 'rate limited', error: /429|too many requests/i },
  { name: 'invalid JSON fails', query: 'bad json', error: /JSON|json/ },
  { name: 'HTTP timeout fails without retry', query: 'slow', error: /timed? ?out|timeout|aborted/i },
];
const results = [];
let instance;
try {
  const version = (await cli(['--version'])).trim();
  assert.equal(version, '2.43.7');
  const workflows = [];
  const executeIds = [];
  const publishIds = [];
  for (let index = 0; index < cases.length; index++) {
    const c = cases[index];
    const child = structuredClone(template);
    child.id = `gifsnapChild${String(index).padStart(4, '0')}`;
    child.nodes.find(n => n.name === 'Search GifSnap').parameters.url = 'http://127.0.0.1:8787/api/v1/gifs/search';
    workflows.push(child);
    let executeId = child.id;
    if (!c.manual) {
      publishIds.push(child.id);
      const parent = {
        id: `gifsnapParent${String(index).padStart(3, '0')}`, name: 'Fixture caller', active: false,
        nodes: [
          { id: 'start', name: 'Start', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
          { id: 'call', name: 'Call search', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.4, position: [220, 0], parameters: {
            source: 'database', workflowId: { __rl: true, mode: 'id', value: child.id }, mode: 'once', options: { waitForSubWorkflow: true },
            workflowInputs: { mappingMode: 'defineBelow', value: { query: c.query, limit: c.limit ?? 3 }, matchingColumns: [], schema: [
              { id: 'query', displayName: 'query', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
              { id: 'limit', displayName: 'limit', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'number' },
            ], attemptToConvertTypes: false },
          } },
        ], connections: { Start: { main: [[{ node: 'Call search', type: 'main', index: 0 }]] } }, settings: { executionOrder: 'v1' },
      };
      workflows.push(parent);
      executeId = parent.id;
    }
    executeIds.push(executeId);
  }
  const importFile = `${tmp}/workflows.json`;
  await writeFile(importFile, JSON.stringify(workflows));
  const imported = await cli(['import:workflow', `--input=${importFile}`]);
  assert.ok(imported.includes(`Successfully imported ${workflows.length} workflows.`), 'All fixture workflows must import successfully');

  // In 2.43.7 the legacy server CLI publish command does not populate the
  // default publication service. Use the same local publish endpoint as the
  // editor, with a disposable instance owner and no external network access.
  instance = spawn('n8n', ['start'], { env: { ...env, N8N_SECURE_COOKIE: 'false', N8N_LISTEN_ADDRESS: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let startupLog = '';
  for (const stream of [instance.stdout, instance.stderr]) stream.on('data', chunk => { startupLog = (startupLog + chunk).slice(-2000); });
  let ready = false;
  for (let attempt = 0; attempt < 45; attempt++) {
    // /healthz is available before n8n has registered its editor API routes.
    try {
      const settings = await fetch('http://127.0.0.1:5678/rest/settings', { signal: AbortSignal.timeout(1000) });
      ready = settings.ok && Boolean((await settings.json()).data);
    } catch {}
    if (ready) break;
    if (instance.exitCode !== null) throw new Error(`Fixture instance stopped: ${startupLog}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(ready, `Fixture n8n instance did not start: ${startupLog}`);
  const setup = await fetch('http://127.0.0.1:5678/rest/owner/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'fixture@example.invalid', firstName: 'Fixture', lastName: 'Owner', password: `Test1!${randomUUID()}` }) });
  assert.ok(setup.ok, `Fixture owner setup failed (${setup.status})`);
  const cookie = setup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie, 'Fixture session cookie must be present');
  for (const id of publishIds) {
    const saved = await fetch(`http://127.0.0.1:5678/rest/workflows/${id}`, { headers: { Cookie: cookie } });
    assert.ok(saved.ok, `Could not read imported workflow (${saved.status})`);
    const { data } = await saved.json();
    const published = await fetch(`http://127.0.0.1:5678/rest/workflows/${id}/activate`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId: data.versionId }) });
    assert.ok(published.ok, `Could not publish fixture workflow (${published.status}): ${(await published.text()).slice(0, 300)}`);
  }
  const stopped = new Promise(resolve => instance.once('exit', resolve));
  instance.kill('SIGTERM');
  await stopped;
  instance = undefined;

  for (let index = 0; index < cases.length; index++) {
    const c = cases[index];
    const before = requests.length;
    const started = Date.now();
    const output = await cli(['execute', `--id=${executeIds[index]}`, '--rawOutput']);
    const execution = executionData(output);
    const result = execution.data.resultData;
    if (c.error) {
      assert.ok(result.error, `${c.name}: expected a failed execution`);
      assert.match(JSON.stringify(result.error), c.error, c.name);
    } else {
      assert.equal(result.error, undefined, `${c.name}: ${JSON.stringify(result.error)}`);
      const last = c.manual ? 'Return GIFs' : 'Call search';
      const items = result.runData[last].at(-1).data.main[0];
      assert.equal(items.length, 1);
      const returned = items[0].json;
      assert.equal(returned.query, c.query.trim());
      assert.equal(returned.data.length, c.empty ? 0 : 1);
      if (!c.empty) assert.deepEqual(returned.data[0], media);
      assert.equal(returned.pagination.next_page, null);
    }
    const count = requests.length - before;
    assert.equal(count, c.requestCount ?? 1, `${c.name}: unexpected request/retry count`);
    for (const request of requests.slice(before)) {
      assert.equal(request.method, 'GET');
      assert.deepEqual(request.params, { q: c.query.trim(), page: '1', limit: String(c.limit ?? 3) });
      assert.equal(request.body, '');
      assert.equal(request.authorization, undefined);
    }
    const row = { name: c.name, status: 'PASS', httpRequests: count, elapsedMs: Date.now() - started };
    results.push(row);
    console.log(JSON.stringify(row));
  }
  const report = { testedAt: new Date().toISOString(), n8nVersion: version, status: 'PASS', cases: results, fixtureRequests: requests.length, liveGifSnapRequests: 0, mediaDownloads: 0, network: 'disabled; loopback fixture only', scope: 'Actual n8n import, manual execution and published sub-workflow calls. No LLM or n8n Cloud session tested.' };
  await writeFile('/out/runtime-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  instance?.kill('SIGTERM');
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
