# GifSnap integration reference

## Select the correct package and version

- React/Next.js UI: [`@rowix/gifsnap-react`](https://www.npmjs.com/package/@rowix/gifsnap-react), version 0.1.2 on npm. Install with `npm install @rowix/gifsnap-react`.
- Framework-free client and Vue/Svelte examples: [`@rowix/gifsnap-js`](https://www.npmjs.com/package/@rowix/gifsnap-js), version 0.1.0 on npm. Install with `npm install @rowix/gifsnap-js`.
- Angular UI: [`@rowix/gifsnap-angular`](https://www.npmjs.com/package/@rowix/gifsnap-angular), version 0.1.0 on npm. Install with `npm install @rowix/gifsnap-angular`; npm resolves its JavaScript dependency automatically.
- Swift/SwiftUI: [GifSnap Swift 0.1.1](https://github.com/rowixgroup/gifsnap-swift/tree/0.1.1).
- Kotlin/Compose: [GifSnap Android 0.1.1](https://github.com/rowixgroup/gifsnap-android/tree/0.1.1).

Use the [README installation commands](../README.md) before following these examples. Do not install the Git repository as though its root were a single npm package.

## JavaScript client: cancellation and errors

```ts
import { createGifSnapClient, GifSnapError } from '@rowix/gifsnap-js';

const client = createGifSnapClient({ timeoutMs: 15000 });
const controller = new AbortController();

async function load() {
  try {
    const result = await client.search({
      query: 'hello',
      page: 1,
      limit: 24,
      signal: controller.signal,
    });
    console.log(result.data, result.pagination);
  } catch (error) {
    if (controller.signal.aborted) return;
    if (error instanceof GifSnapError) {
      console.error(error.code, error.status, error.retryAfterSeconds);
      return;
    }
    throw error;
  }
}

void load();
// In the owning screen/component cleanup: controller.abort();
```

`createGifSnapClient` accepts `baseUrl`, `fetch` and `timeoutMs`. The default whole-request timeout is 15 seconds; valid overrides are integers from 1 to 120000 ms. `GifSnapError.code` is `http`, `network`, `timeout` or `invalid_response`. Cancellation preserves the signal's reason, normally an AbortError. There are no automatic retries.

The JavaScript methods are `search`, `trending`, `searchStickers` and `trendingStickers`. Search takes `{ query, page?, limit?, signal? }`; trending takes `{ page?, limit?, signal? }`. Use page numbers, not `offset`, in SDK options. Defaults are page 1 and limit 24; limit is 1–50. Follow `pagination.has_next` and `pagination.next_page`, and stop a UI from repeatedly requesting empty or duplicate-only batches.

## React selection and Next.js boundaries

```tsx
'use client';

import { useState } from 'react';
import { GifPicker, type GifSnapGif } from '@rowix/gifsnap-react';
import '@rowix/gifsnap-react/styles.css';

export default function Composer() {
  const [selected, setSelected] = useState<GifSnapGif | null>(null);
  return (
    <section>
      {selected && <p>Selected: {selected.title || 'GIF'}</p>}
      <GifPicker onSelect={setSelected} theme="system" pageSize={24} />
    </section>
  );
}
```

`GifPicker` supports `onSelect`, `theme`, `pageSize`, `initialQuery`, `className` and `client`. `initialQuery` is initial-only. A custom `client` should keep a stable object identity. Pass `theme="light"` or `theme="dark"` when the host app overrides the operating-system preference.

For server-side GIF data, import `createGifSnapClient` from `@rowix/gifsnap-react/client`. It supplies `search` and `trending`; it does not provide the separate JavaScript client's sticker methods. An event callback and the React picker belong in a Client Component.

## Angular selection

```ts
import { Component } from '@angular/core';
import { GifSnapPicker, type GifSnapGif } from '@rowix/gifsnap-angular';

@Component({
  selector: 'app-gif-composer',
  standalone: true,
  imports: [GifSnapPicker],
  template: `
    <gifsnap-picker
      theme="system"
      mediaType="sticker"
      [pageSize]="24"
      (gifSelect)="select($event)"
    />
  `,
})
export class GifComposer {
  select(gif: GifSnapGif): void {
    console.log(gif.url);
  }
}
```

The component uses encapsulated styles and returns the complete selected item. No global CSS import is required. Use the same public `GifSnapClient` interface for an injected client. The browser loads results after initialization; server rendering does not fetch the feed.

## Vue and Svelte

The [Vue 3 example](../packages/javascript/examples/GifSearch.vue) emits `select`; the [Svelte 5 example](../packages/javascript/examples/GifSearch.svelte) accepts `onSelect`. They abort replaced requests and cleanup on unmount. They demonstrate first-page search, not complete pagination or media fallback. Keep those limitations when adapting them; the JavaScript package itself is a data client.

## Response and media rules

A successful list response contains `data`, `pagination` and optional `query`. Each item includes `id`, `title`, `url`, `preview_url`, `width`, `height`, `type`, and optional `source` and `content_id`. Clients preserve additional metadata and raw response counts. Provider IDs are not interchangeable.

- Use full `url` for animation, including animated WebP. Do not infer animation from the filename alone.
- A distinct `preview_url` can be used as a bounded error fallback, but may be static.
- Preserve URL query strings. Do not manufacture identity from titles or URL directories.
- Compare optional `content_id` exactly as an opaque value; preserve the original item for selection and API lookup.
- Media URLs may use external CDN domains. Follow normal host-app network and content-security policies.

SDK code is MIT licensed. Media/service terms and availability remain separate. No source/provider labels are rendered in the packaged pickers; source metadata remains available to applications. A Powered by GifSnap link remains visible.
