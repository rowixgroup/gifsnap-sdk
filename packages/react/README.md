# @rowix/gifsnap-react

A small React GIF picker and typed client for the public GifSnap API. React 18.2 and 19 are supported. No runtime dependencies besides React; React is a peer dependency and is not bundled.

Version 0.1.2 is distributed as the direct archive below. The npm registry currently provides 0.1.1; a bare npm install does not select 0.1.2.

```sh
npm install https://gifsnap.com/downloads/rowix-gifsnap-react-0.1.2.tgz
```

## React picker

```tsx
import { GifPicker, type GifSnapGif } from '@rowix/gifsnap-react';
import '@rowix/gifsnap-react/styles.css';

export function Composer() {
  function select(gif: GifSnapGif) {
    // Store the complete object if you need its provider attribution later.
    console.log(gif.url, gif.source);
  }
  return <GifPicker onSelect={select} theme="system" />;
}
```

The picker loads trending GIFs, submits searches, and appends pages using the API's `next_page`. It aborts superseded requests, ignores stale results, deduplicates matching IDs, complete media URLs, or optional API-supplied `content_id` values across pages, stops on empty or duplicate-only pages, and provides retry controls. Images load the full `url` so animated GIF and WebP assets play; `preview_url` is only used if that asset fails. Lazy loading and stable preview boxes remain in place. The picker keeps the first matching item, preserving its original ID, URL, and metadata. Without a shared `content_id`, different encodings or provider aliases with different IDs and URLs remain separate; query strings are never removed to guess identity. All controls are native keyboard-accessible form elements. The picker displays a linked “Powered by GifSnap” attribution. Provider metadata remains in the returned item without a visible source label. Styles are scoped to `.gifsnap-picker`; import the CSS once.

| Prop | Default | Meaning |
| --- | --- | --- |
| `onSelect(gif)` | required | Receives the complete API GIF object, including extra provider metadata. |
| `theme` | `"system"` | `"light"`, `"dark"`, or OS preference via `"system"`. Pass your host app's chosen theme explicitly if it differs from the OS. |
| `pageSize` | `24` | Integer from 1 to 50. Invalid values fall back to 24. |
| `initialQuery` | `""` | Initial search; empty means trending. Later prop changes do not control the search. |
| `className` | `""` | Extra class on the root section. |
| `client` | public client | Optional `GifSnapClient` for a proxy, custom fetch, or tests. Keep its identity stable between renders. |

Search is submitted explicitly, not on every keystroke. No analytics, storage, cookies, API keys, automatic retries, or provider calls are added by the SDK. The public API and media hosts receive normal network requests from the visitor.

## Next.js App Router

Use a client component for the callback. Import the CSS in your root layout or this component:

```tsx
'use client';

import { GifPicker } from '@rowix/gifsnap-react';
import '@rowix/gifsnap-react/styles.css';

export default function Picker() {
  return <GifPicker onSelect={(gif) => console.log(gif.url)} />;
}
```

The React entry preserves its `'use client'` directive. For a Server Component, Route Handler, Node.js script, or a non-React app, import the separate `@rowix/gifsnap-react/client` entry instead.

## Typed API client

```ts
import { createGifSnapClient, GifSnapError } from '@rowix/gifsnap-react/client';

const client = createGifSnapClient();
const controller = new AbortController();
try {
  const result = await client.search({ query: 'hello', page: 1, limit: 24, signal: controller.signal });
  console.log(result.data, result.pagination.next_page);
  const trending = await client.trending({ limit: 12 });
} catch (error) {
  if (error instanceof GifSnapError) {
    console.error(error.code, error.status, error.retryAfterSeconds);
  }
}
// controller.abort();
```

`createGifSnapClient({ baseUrl?, fetch?, timeoutMs? })` defaults to `https://gifsnap.com/api/v1`. A custom base URL must be HTTP(S), without credentials, a query, or a fragment. Node.js 18+ has native fetch; other environments can inject it. Requests omit credentials. The full request times out after 15 seconds; set `timeoutMs` to an integer from 1 to 120000 to change this. The service currently accepts these public requests without an API key; availability and service policy may change.

- `search({ query, page = 1, limit = 24, signal? })` calls `GET /gifs/search?q=…&page=…&limit=…`.
- `trending({ page = 1, limit = 24, signal? } = {})` calls `GET /gifs/trending?page=…&limit=…`.
- `page` is a positive safe integer; `limit` is an integer from 1 to 50. Invalid arguments reject before fetching.
- Use **page**, not offset, in SDK options. `pagination.offset` remains available in responses.
- A successful response has `data: GifSnapGif[]`, `pagination: { page, limit, total, has_next, next_page, offset }`, and optional `query`. `next_page` is null at the end. Runtime validation rejects malformed successful responses and unsafe media URL schemes.
- A GIF has `id`, `title`, `url`, `preview_url`, `width`, `height`, `type`, and optional `source` and `content_id`. Extra fields are preserved. URLs can point to animated WebP or other image formats; do not infer format or provider from `id` or file extensions. Source metadata is preserved as supplied by the service.
- `content_id`, when present, is a non-empty opaque string supplied by the API for verified content aliases. It is optional: older responses and unverified items remain valid. Use it only for identity comparison; keep the original item `id` and media URLs for lookup, selection, and display. The client returns all response records unchanged; only the picker filters duplicate display items.
- `GifSnapError.code` is `http`, `network`, `invalid_response`, or `timeout`. HTTP errors include `status`; a valid `Retry-After` header adds `retryAfterSeconds`. The SDK does not automatically retry or claim an API quota. Cancellation preserves the signal's reason (normally `AbortError`).

## Development

```sh
npm ci
npm test
npm pack
```

Tests use mocked HTTP and JSDOM/React to cover response validation, cancellation, rate-limit errors, paging, selection, stale results, retry and unmount cleanup. A build emits ESM, declarations and scoped CSS; no bundler or runtime helper is required. CommonJS `require()` is not an advertised entry point.

## License and media

The SDK code and documentation are MIT licensed. The license does not cover API services, GIFs, stickers, provider trademarks, or media usage rights. Preserve provider attribution and follow the applicable media/service terms for your use. The SDK makes no blanket claim that the catalog is cleared for commercial reuse.

[GifSnap developer documentation](https://gifsnap.com/developers)
