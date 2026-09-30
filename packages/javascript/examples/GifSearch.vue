<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { createGifSnapClient, type GifSnapGif } from '@rowix/gifsnap-js';
const emit = defineEmits<{ select: [gif: GifSnapGif] }>();
const client = createGifSnapClient();
const query = ref('hello'), items = ref<GifSnapGif[]>([]);
const loading = ref(false), error = ref('');
let controller: AbortController | undefined;
async function search() {
  controller?.abort();
  const request = new AbortController(); controller = request;
  loading.value = true; error.value = ''; items.value = [];
  try {
    const options = { limit: 12, signal: request.signal };
    const result = query.value.trim()
      ? await client.search({ ...options, query: query.value })
      : await client.trending(options);
    if (!request.signal.aborted) items.value = result.data;
  } catch {
    if (!request.signal.aborted) error.value = 'Could not load GIFs. Try again.';
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}
onMounted(() => { void search(); });
onUnmounted(() => controller?.abort());
</script>

<template>
  <form @submit.prevent="search">
    <label>Search GIFs <input v-model="query" type="search" maxlength="120" /></label>
    <button type="submit">Search</button>
  </form>
  <p role="status">{{ loading ? 'Loading GIFs…' : `${items.length} GIFs` }}</p>
  <p v-if="error" role="alert">{{ error }}</p>
  <ul>
    <li v-for="(gif, index) in items" :key="`${gif.id}:${index}`">
      <button type="button" :aria-label="`Select ${gif.title || 'GIF'}`" @click="emit('select', gif)">
        <img :src="gif.url" alt="" :width="gif.width || 240" :height="gif.height || 180" loading="lazy" />
        {{ gif.title }}
      </button>
    </li>
  </ul>
  <a href="https://gifsnap.com" target="_blank" rel="noopener noreferrer">Powered by GifSnap</a>
</template>
