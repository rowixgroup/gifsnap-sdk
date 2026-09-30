# @rowix/gifsnap-angular

A standalone, styled Angular GIF and sticker picker powered by `@rowix/gifsnap-js`. Angular 21.2.24+ or 22; AngularJS is not supported. Built as a partially compiled Angular Package Format library. No React, global CSS, forms module, API key, or service provider setup is required.

Version 0.1.0 and its JavaScript dependency are distributed as direct archives, not npm registry packages. Install both URLs in the same command so the dependency resolves locally.

```sh
npm install https://gifsnap.com/downloads/rowix-gifsnap-js-0.1.0.tgz https://gifsnap.com/downloads/rowix-gifsnap-angular-0.1.0.tgz
```

```ts
import { Component } from '@angular/core';
import { GifSnapPicker, type GifSnapGif } from '@rowix/gifsnap-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GifSnapPicker],
  template: `<gifsnap-picker theme="system" (gifSelect)="onSelect($event)" />`,
})
export class App {
  onSelect(gif: GifSnapGif): void {
    // Use gif.url for animation. preview_url may be static.
    console.log(gif.url, gif.source);
  }
}
```

The picker uses Angular's default emulated style encapsulation. There is no stylesheet import. `theme="system"` follows the operating system with CSS; pass `light` or `dark` to follow an application's explicit preference. It does not write storage or change the host document theme.

## Inputs and output

| API | Default | Purpose |
| --- | --- | --- |
| `theme` | `system` | `light`, `dark`, or `system` |
| `mediaType` | `gif` | `gif` or `sticker` |
| `pageSize` | `24` | Items per request, 1–50; invalid values use 24 |
| `initialQuery` | empty | Initial value only; searches are submitted explicitly |
| `client` | Public GifSnap client | A `GifSnapClient` for a proxy, custom Fetch, or tests |
| `(gifSelect)` | — | Emits the original typed `GifSnapGif` item |

```html
<gifsnap-picker
  mediaType="sticker"
  theme="dark"
  [pageSize]="12"
  initialQuery="hello"
  (gifSelect)="onSelect($event)"
/>
```

Search, reset and Load more are keyboard-accessible native controls. Loading status is announced politely; errors expose a retry button. The first returned item stays stable across appended pages. Duplicate IDs, exact full URLs and verified optional `content_id` values are deduplicated without title guesses or URL rewriting. Empty or duplicate-only batches stop further pagination, so raw server totals can exceed the visible count.

Full `url` is rendered first, including animated WebP. A failed full URL gets one distinct `preview_url` attempt; after both fail, a text placeholder appears. A preview fallback can be static. Width/height and a fixed preview area reserve layout space. A linked Powered by GifSnap attribution stays visible; provider metadata remains in the returned item without a source label. The selection output preserves extra provider metadata.

Requests are aborted on a new search, client/media/page-size change, or component destruction. Stale results from even a custom non-cancellable client are ignored. The component does not fetch during server rendering; browser initialization loads results. It works with zoneless and zone-based Angular change detection using signals and OnPush.

## Custom endpoint or fetch

```ts
import { createGifSnapClient } from '@rowix/gifsnap-angular';
const pickerClient = createGifSnapClient({
  baseUrl: 'https://example.com/api/v1',
  timeoutMs: 15000,
});
// Bind [client]="pickerClient" in the component that owns this property.
```

Client methods are `search`, `trending`, `searchStickers`, and `trendingStickers`. Search takes `{ query, page?, limit?, signal? }`; trending takes `{ page?, limit?, signal? }`. The default API base is `https://gifsnap.com/api/v1`. HTTP and response validation, typed `GifSnapError`, cancellation, and a 15-second default timeout are supplied by the JavaScript package. No cookies, hidden telemetry, or automatic retries are added.

## Development and verification

Use a Node version supported by Angular; this package was built with Node 24.21.0, Angular 21.2.24, TypeScript 5.9.3 and ng-packagr 21.2.7. For local pre-publication testing, first build/pack `../javascript`, then install its tarball with `npm install --no-save ../javascript/rowix-gifsnap-js-0.1.0.tgz`. `npm test` builds the partial library and exercises rendered component flows. `npm run pack:release` packs **dist**, not the source directory.

Angular documentation: [Package Format](https://angular.dev/tools/libraries/angular-package-format), [creating libraries](https://angular.dev/tools/libraries/creating-libraries), [version compatibility](https://angular.dev/reference/versions).

## License

MIT covers this SDK's code only. It does not license the API service, GIF/sticker media, trademarks, or provider catalog. Media usage and attribution remain subject to the relevant provider/API terms. See [GifSnap developer documentation](https://gifsnap.com/developers).
