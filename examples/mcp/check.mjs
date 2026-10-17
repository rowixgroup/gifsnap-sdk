// Node.js 18+. No installation or API key required.
// Default: protocol discovery only. --search makes ONE example GIF search.
const endpoint = 'https://gifsnap.com/plugins/chatgpt/mcp';
const search = process.argv.slice(2).includes('--search');
if (process.argv.slice(2).some(arg => arg !== '--search')) {
  throw new Error('Usage: node examples/mcp/check.mjs [--search]');
}
let nextId = 1;
let protocolVersion;
async function request(method, params, notification = false) {
  const id = notification ? undefined : nextId++;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'User-Agent': 'GifSnap-MCP-Example-Verification/1.0',
      ...(protocolVersion ? { 'MCP-Protocol-Version': protocolVersion } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  if (notification) return;
  const message = await response.json();
  if (message.id !== id || message.error) throw new Error(`${method}: ${JSON.stringify(message.error || 'Invalid response ID')}`);
  return message.result;
}

const initialized = await request('initialize', {
  protocolVersion: '2025-11-25',
  capabilities: {},
  clientInfo: { name: 'gifsnap-mcp-example-check', version: '1.0.0' },
});
protocolVersion = initialized.protocolVersion;
await request('notifications/initialized', undefined, true);
const { tools } = await request('tools/list', {});
if (!tools.some(tool => tool.name === 'search_gifs')) throw new Error('search_gifs was not advertised');
const report = {
  checkedAtUTC: new Date().toISOString(),
  verificationTraffic: true,
  endpoint,
  server: initialized.serverInfo,
  protocolVersion,
  tools: tools.map(tool => tool.name),
  liveSearches: search ? 1 : 0,
};
if (search) {
  const result = await request('tools/call', {
    name: 'search_gifs', arguments: { query: 'friendly wave', limit: 1 },
  });
  if (result.isError) throw new Error('GIF search returned an error');
  report.search = result.structuredContent;
  if (!report.search || !['ok', 'empty'].includes(report.search.status)) throw new Error('Unexpected search status');
  for (const gif of report.search.gifs) {
    if (new URL(gif.url).protocol !== 'https:' || new URL(gif.animationUrl).protocol !== 'https:') {
      throw new Error('Expected HTTPS media URLs');
    }
  }
}
console.log(JSON.stringify(report, null, 2));
