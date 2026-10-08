# GifSnap SDKs

Add GIF search and selection to an app with a React or Angular picker, or build your own interface with the typed JavaScript client. Vue and Svelte examples use the same client. Native Swift and Android SDKs are maintained in their own repositories.

[Developer overview](https://gifsnap.com/developers) · [API documentation](https://gifsnap.com/docs) · [Integration guide](docs/integration.md)

## Choose an integration

| Integration | Current version | Documentation and source |
| --- | --- | --- |
| React / Next.js | [0.1.2 on npm](https://www.npmjs.com/package/@rowix/gifsnap-react) | [React package](packages/react/README.md) |
| JavaScript / TypeScript, Vue, Svelte | [0.1.0 on npm](https://www.npmjs.com/package/@rowix/gifsnap-js) | [JavaScript package](packages/javascript/README.md) |
| Angular | [0.1.0 on npm](https://www.npmjs.com/package/@rowix/gifsnap-angular) | [Angular package](packages/angular/README.md) |
| Swift / SwiftUI | 0.1.1 | [Swift repository and installation](https://github.com/rowixgroup/gifsnap-swift) |
| Kotlin / Jetpack Compose | 0.1.1 | [Android repository and installation](https://github.com/rowixgroup/gifsnap-android) |

React 0.1.2, JavaScript 0.1.0 and Angular 0.1.0 are published to npm under the `@rowix` scope. Install the package for your framework with the commands below. Angular installs its JavaScript dependency automatically. Native installation requirements are documented in their linked repositories.

## React and Next.js

Requires React 18.2 or 19.

```sh
npm install @rowix/gifsnap-react
```

```tsx
'use client'; // Required for this component in the Next.js App Router.

import { GifPicker } from '@rowix/gifsnap-react';
import '@rowix/gifsnap-react/styles.css';

export default function Composer() {
  return <GifPicker theme="system" onSelect={(gif) => console.log(gif.url)} />;
}
```

The callback receives the original selected object. The picker handles submitted searches, pagination, loading/error states, deduplication, and full GIF/animated WebP image URLs. For server code, import the client from `@rowix/gifsnap-react/client`; do not import the React component entry in a Server Component. The React package's client currently provides GIF search/trending; the separate JavaScript client also provides sticker methods.

## JavaScript, TypeScript, Vue and Svelte

Requires a browser with Fetch/AbortController or Node.js 18+.

```sh
npm install @rowix/gifsnap-js
```

```ts
import { createGifSnapClient } from '@rowix/gifsnap-js';

const client = createGifSnapClient();
const result = await client.search({ query: 'hello', page: 1, limit: 24 });
console.log(result.data, result.pagination.next_page);

const stickers = await client.trendingStickers({ limit: 12 });
```

Copy the [Vue 3 component example](packages/javascript/examples/GifSearch.vue) or [Svelte 5 component example](packages/javascript/examples/GifSearch.svelte) into an existing application. They demonstrate first-page search, loading/error states, selection and cleanup. They are examples rather than complete paginated picker packages; add pagination and media-error handling for your own UI.

## Angular

Requires Angular 21.2.24+ or 22, with a compatible Node/TypeScript environment. AngularJS is not supported. npm installs the required `@rowix/gifsnap-js` dependency automatically.

```sh
npm install @rowix/gifsnap-angular
```

```ts
import { Component } from '@angular/core';
import { GifSnapPicker, type GifSnapGif } from '@rowix/gifsnap-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GifSnapPicker],
  template: `<gifsnap-picker theme="system" (gifSelect)="select($event)" />`,
})
export class App {
  select(gif: GifSnapGif): void {
    console.log(gif.url);
  }
}
```

Styles are encapsulated. No separate CSS import or forms-module setup is needed. Add `mediaType="sticker"` to choose stickers.

## Native apps

Swift Package Manager, iOS 16+ for the picker:

```swift
.package(url: "https://github.com/rowixgroup/gifsnap-swift.git", from: "0.1.1")
```

Add the `GifSnapUI` product to the app target, then:

```swift
import SwiftUI
import GifSnapUI

struct GIFComposer: View {
    var body: some View {
        GifSnapPicker { gif in
            print(gif.url)
        }
    }
}
```

The [Swift guide](https://github.com/rowixgroup/gifsnap-swift#readme) covers the separate Foundation client, package products, animation dependency and tested platforms.

For Android, configure the `https://gifsnap.com/sdk/android` Maven repository as described in the [Android installation guide](https://github.com/rowixgroup/gifsnap-android#install), then add:

```kotlin
implementation("com.rowix.gifsnap:gifsnap-compose:0.1.1")
```

The Compose picker requires API 28+; the separate Kotlin client supports API 23+. Follow the native repository for compiler/Gradle requirements and the Maven-layout ZIP alternative. These artifacts are not advertised as Maven Central or JitPack releases.

## Media and API behavior

Render the full `url` to play returned GIF or animated WebP media; `preview_url` can be a still image. Preserve complete URLs, query strings, IDs and optional source metadata. An optional opaque `content_id` identifies verified aliases; it does not replace the item's lookup ID. Client responses retain the server's records and raw pagination counts. Picker display deduplication can make visible counts smaller.

The default base URL is `https://gifsnap.com/api/v1`. Public requests currently need no API key. Handle failures, cancellation and future access-policy changes. SDKs add no analytics. API access, media rights and availability are separate from the SDK's MIT license; no quota, performance, commercial-media clearance or SLA is promised. Pickers retain a Powered by GifSnap link without displaying provider/source labels.

## Build and test the web packages

This is a source repository, not a single workspace package. React and JavaScript have safe npm lockfiles; from either package directory, run `npm ci` then `npm test`. Tests build the package and use mocked requests; they do not require an API key.

From `packages/angular`, install the declared development dependencies and run the tests:

```sh
npm install
npm test
```

Use a Node version supported by Angular; this source was developed with Node 24.21.0, Angular 21.2.24, TypeScript 5.9.3 and ng-packagr 21.2.7. Build output, dependencies and local package archives are ignored. `packages/angular` is source; publishable Angular Package Format output is built in `dist`, not the source directory.

## Documentation for coding assistants

The [integration guide](docs/integration.md) and package READMEs provide concrete imports, release status and examples. [GifSnap SDKs on Context7](https://context7.com/rowixgroup/gifsnap-sdk) makes these docs available to connected coding assistants. `context7.json` identifies the documentation and usage rules to index. Developers must configure their own documentation or MCP tools; no automatic assistant recommendation or installation is implied.

After publishing an SDK version, verify its npm registry metadata, update the version and install instructions in this README, the package README, the integration guide and `context7.json`, then refresh Context7 and check a fresh installation example. An accepted refresh alone does not verify the returned instructions.

## License

SDK source and documentation: [MIT](LICENSE). Media, API services and third-party trademarks are excluded. Each native repository documents its own dependencies and notices.
