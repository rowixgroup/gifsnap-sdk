<script lang="ts">
  import { onMount } from 'svelte';
  import { createGifSnapClient, type GifSnapGif } from '@rowix/gifsnap-js';
  let { onSelect }: { onSelect: (gif: GifSnapGif) => void } = $props();
  const client = createGifSnapClient();
  let query = $state('hello'), items = $state<GifSnapGif[]>([]);
  let loading = $state(false), error = $state('');
  let controller: AbortController | undefined;
  async function search(event?: SubmitEvent) {
    event?.preventDefault();
    controller?.abort();
    const request = new AbortController(); controller = request;
    loading = true; error = ''; items = [];
    try {
      const options = { limit: 12, signal: request.signal };
      const result = query.trim()
        ? await client.search({ ...options, query })
        : await client.trending(options);
      if (!request.signal.aborted) items = result.data;
    } catch {
      if (!request.signal.aborted) error = 'Could not load GIFs. Try again.';
    } finally {
      if (!request.signal.aborted) loading = false;
    }
  }
  onMount(() => {
    void search();
    return () => controller?.abort();
  });
</script>

<form onsubmit={search}>
  <label>Search GIFs <input bind:value={query} type="search" maxlength="120" /></label>
  <button type="submit">Search</button>
</form>
<p role="status">{loading ? 'Loading GIFs…' : `${items.length} GIFs`}</p>
{#if error}<p role="alert">{error}</p>{/if}
<ul>
  {#each items as gif, index (`${gif.id}:${index}`)}
    <li>
      <button type="button" aria-label={`Select ${gif.title || 'GIF'}`} onclick={() => onSelect(gif)}>
        <img src={gif.url} alt="" width={gif.width || 240} height={gif.height || 180} loading="lazy" />
        {gif.title}
      </button>
    </li>
  {/each}
</ul>
<a href="https://gifsnap.com" target="_blank" rel="noopener noreferrer">Powered by GifSnap</a>
