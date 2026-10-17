# @rowix/gifsnap-js

A small framework-free TypeScript client for the public GifSnap GIF and sticker API. No React dependency, API key, hidden telemetry, cookies, or automatic retries. ESM for modern browsers and Node 18+ with Fetch/AbortController support.

Version 0.1.0 is [published on npm](https://www.npmjs.com/package/@rowix/gifsnap-js).

```sh
npm install @rowix/gifsnap-js
```

```ts
import { createGifSnapClient, GifSnapError } from '@rowix/gifsnap-js';

const client = createGifSnapClient();
const controller = new AbortController();
const first = await client.search({ query: 'hello', limit: 24, signal: controller.signal });
for (const gif of first.data) {
  // Render gif.url for animation; preview_url may be static.
  console.log(gif.url, gif.source);
}
if (first.pagination.has_next && first.pagination.next_page !== null) {
  const next = await client.search({ query: 'hello', page: first.pagination.next_page });
}
// Cancel when navigation or the search query changes:
controller.abort();
```

`client.search({ query, page?, limit?, signal? })` and `client.trending({ page?, limit?, signal? })` return GIFs. `searchStickers` and `trendingStickers` use the sticker endpoints with identical options. Defaults: page 1, limit 24; limit range 1–50. Empty search queries are rejected. Pagination is the server's raw pagination, not a count of unique media. Stop at an empty page, and guard repeated/duplicate-only pages in a UI.

## HTTP routes and SDK options

The SDK uses `query` in its JavaScript options and encodes it as the HTTP query parameter `q`. `signal` is a local Fetch option, never a query parameter. Every request uses GET. These are the exact routes with the default base URL:

| JavaScript method | Complete HTTP endpoint | HTTP query parameters |
| --- | --- | --- |
| `client.search({ query, page?, limit?, signal? })` | `https://gifsnap.com/api/v1/gifs/search` | `q`, `page`, `limit` |
| `client.trending({ page?, limit?, signal? })` | `https://gifsnap.com/api/v1/gifs/trending` | `page`, `limit` |
| `client.searchStickers({ query, page?, limit?, signal? })` | `https://gifsnap.com/api/v1/stickers/search` | `q`, `page`, `limit` |
| `client.trendingStickers({ page?, limit?, signal? })` | `https://gifsnap.com/api/v1/stickers/trending` | `page`, `limit` |

For example, `client.search({ query: 'hello', page: 1, limit: 12 })` requests `https://gifsnap.com/api/v1/gifs/search?q=hello&page=1&limit=12`. The client encodes the search text. Routes retain their `gifs/` or `stickers/` segment after a custom base URL; do not infer a route from a method name.

```sh
curl 'https://gifsnap.com/api/v1/gifs/search?q=hello&page=1&limit=12'
curl 'https://gifsnap.com/api/v1/gifs/trending?page=1&limit=12'
curl 'https://gifsnap.com/api/v1/stickers/search?q=hello&page=1&limit=12'
curl 'https://gifsnap.com/api/v1/stickers/trending?page=1&limit=12'
```

## Client configuration

`createGifSnapClient({ baseUrl?, fetch?, timeoutMs? })` supports a proxy or injected Fetch implementation. The default base is `https://gifsnap.com/api/v1`; timeout defaults to 15 seconds (range 1–120000 ms), covering both Fetch and body reading. Cancellation propagates the original AbortSignal reason. HTTP errors are `GifSnapError` with `code`, `status`, and optional `retryAfterSeconds`; other codes are `network`, `invalid_response`, and `timeout`. Requests use GET, Accept: application/json, and credentials: omit. There is no retry loop.

The options object and all three properties are optional: `createGifSnapClient()` uses the public default base URL, native Fetch and a 15-second timeout. `baseUrl` is only needed to override that default.

Exported types: `GifSnapGif`, `GifSnapPagination`, `GifSnapResponse`, `GifSnapClient`, `GifSnapClientOptions`, `GifSnapPageOptions`, `GifSnapSearchOptions`, `GifSnapErrorCode`.

Items retain full `url`, `preview_url`, `source`, optional opaque verified `content_id`, and additional provider metadata. Never strip URL query parameters or infer provider identity from filenames. A `.webp` media URL can be animated. Use the original item when returning a selection. The Vue and Svelte examples show titles and a [Powered by GifSnap](https://gifsnap.com) link without provider source labels; selections retain the original item metadata.

Vue and Svelte can call this client inside their component lifecycle and abort in cleanup; it has no framework integration or lifecycle dependency. Flutter applications should call the documented REST API directly; this is a JavaScript package, not a Dart SDK.

## Development

`npm ci && npm test && npm pack` builds the emitted ESM/types and tests HTTP validation, routes, errors, pagination, cancellation and bounded timeout. Only dist, README, LICENSE and package metadata are published.

## License

MIT covers this SDK's code only. It does not license the API service, GIF/sticker media, trademarks, or provider catalog. Media use and attribution remain subject to the relevant provider/API terms. See [GifSnap developer documentation](https://gifsnap.com/developers).

## Lightweight previews

`gifImageSources(gif)` returns a validated small animated image when available, the original `url`, then the legacy `preview_url`. Try these distinct URLs in order and stop after the final failure. `preview_url` can be static. Keep the complete original item and use `gif.url` when sending; `animated_preview` is optional and malformed metadata is safely ignored.
