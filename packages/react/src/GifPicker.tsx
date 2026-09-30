'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createGifSnapClient, GifSnapError, type GifSnapClient, type GifSnapGif } from './client.js';

export interface GifPickerProps {
  onSelect: (gif: GifSnapGif) => void;
  /** Defaults to the operating system preference. */
  theme?: 'light' | 'dark' | 'system';
  /** Items per request, from 1 to 50. Defaults to 24. */
  pageSize?: number;
  /** Initial value only; search is submitted explicitly. */
  initialQuery?: string;
  className?: string;
  /** Inject a client for a proxy, custom fetch, or testing. */
  client?: GifSnapClient;
}
const defaultClient = createGifSnapClient();
interface PickerState { items: GifSnapGif[]; loading: boolean; error: string; nextPage: number | null }
interface RequestInfo { query: string; page: number; append: boolean }
function unique(items: GifSnapGif[]): GifSnapGif[] {
  const ids = new Set<string>();
  const urls = new Set<string>();
  const contentIds = new Set<string>();
  return items.filter(item => {
    const contentId = typeof item.content_id === 'string' && item.content_id.trim() ? item.content_id : undefined;
    const duplicate = ids.has(item.id) || urls.has(item.url) || (contentId !== undefined && contentIds.has(contentId));
    ids.add(item.id); urls.add(item.url);
    if (contentId !== undefined) contentIds.add(contentId);
    return !duplicate;
  });
}
function GifImage({ gif }: { gif: GifSnapGif }) {
  const [attempt, setAttempt] = useState(0);
  const sources = [...new Set([gif.url, gif.preview_url].filter(Boolean))];
  const src = sources[attempt];
  if (!src) return <span className="gifsnap-picker__unavailable">Preview unavailable</span>;
  return <img key={src} src={src} alt="" loading="lazy" decoding="async" width={gif.width || 240} height={gif.height || 180}
    title={attempt > 0 ? 'Animation unavailable; showing preview' : undefined}
    onError={() => setAttempt(current => current === attempt ? current + 1 : current)} />;
}
function GifCard({ gif, onSelect }: { gif: GifSnapGif; onSelect: GifPickerProps['onSelect'] }) {
  const title = gif.title || 'Untitled GIF';
  return <li className="gifsnap-picker__item">
    <button type="button" className="gifsnap-picker__card" onClick={() => onSelect(gif)} aria-label={`Select ${title}`}>
      <span className="gifsnap-picker__preview">
        <GifImage key={`${gif.url}\0${gif.preview_url}`} gif={gif} />
      </span>
      <span className="gifsnap-picker__title">{title}</span>
    </button>
  </li>;
}
export function GifPicker({ onSelect, theme = 'system', pageSize = 24, initialQuery = '', className = '', client = defaultClient }: GifPickerProps) {
  const inputId = useId();
  const [draft, setDraft] = useState(initialQuery);
  const [search, setSearch] = useState({ query: initialQuery.trim(), revision: 0 });
  const [state, setState] = useState<PickerState>({ items: [], loading: true, error: '', nextPage: null });
  const sequence = useRef(0), busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const failedRequest = useRef<RequestInfo | null>(null);
  const size = Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 50 ? pageSize : 24;
  const load = useCallback(async (request: RequestInfo) => {
    if (request.append && busy.current) return;
    controller.current?.abort();
    const currentController = new AbortController();
    controller.current = currentController;
    const current = ++sequence.current;
    busy.current = true;
    failedRequest.current = null;
    setState(previous => ({ items: request.append ? previous.items : [], loading: true, error: '', nextPage: request.append ? previous.nextPage : null }));
    try {
      const options = { page: request.page, limit: size, signal: currentController.signal };
      const result = request.query ? await client.search({ ...options, query: request.query }) : await client.trending(options);
      if (currentController.signal.aborted || current !== sequence.current) return;
      setState(previous => {
        const items = unique(request.append ? [...previous.items, ...result.data] : result.data);
        const progressed = result.data.length > 0 && (!request.append || items.length > previous.items.length);
        return { items, loading: false, error: '', nextPage: progressed && result.pagination.has_next ? result.pagination.next_page : null };
      });
    } catch (error) {
      if (currentController.signal.aborted || current !== sequence.current) return;
      failedRequest.current = request;
      const message = error instanceof GifSnapError && error.status === 429
        ? `Too many requests. ${error.retryAfterSeconds ? `Try again in ${error.retryAfterSeconds} seconds.` : 'Try again shortly.'}`
        : 'Could not load GIFs. Please try again.';
      setState(previous => ({ ...previous, loading: false, error: message }));
    } finally {
      if (current === sequence.current) busy.current = false;
    }
  }, [client, size]);
  useEffect(() => {
    void load({ query: search.query, page: 1, append: false });
    return () => { ++sequence.current; controller.current?.abort(); busy.current = false; };
  }, [load, search]);
  function searchFor(query: string) { setSearch(previous => ({ query: query.trim(), revision: previous.revision + 1 })); }
  return <section className={`gifsnap-picker ${className}`.trim()} data-theme={theme} aria-label="GIF picker">
    <form className="gifsnap-picker__form" onSubmit={event => { event.preventDefault(); searchFor(draft); }}>
      <label className="gifsnap-picker__label" htmlFor={inputId}>Search GIFs</label>
      <div className="gifsnap-picker__search-row">
        <input id={inputId} className="gifsnap-picker__input" type="search" maxLength={120} autoComplete="off" placeholder="Try happy, cats, or hello" value={draft} onChange={event => setDraft(event.target.value)} />
        <button type="submit" className="gifsnap-picker__button">Search</button>
      </div>
    </form>
    {search.query && <button type="button" className="gifsnap-picker__reset" onClick={() => { setDraft(''); searchFor(''); }}>Back to trending</button>}
    <p className="gifsnap-picker__status" role="status" aria-live="polite">
      {state.loading ? (state.items.length ? 'Loading more GIFs…' : 'Loading GIFs…') : state.error ? '' : state.items.length ? `${state.items.length} GIFs ready to select` : 'No GIFs found. Try another search.'}
    </p>
    <ul className="gifsnap-picker__grid" aria-label="GIF results" aria-busy={state.loading}>
      {state.items.map(gif => <GifCard key={gif.id} gif={gif} onSelect={onSelect} />)}
    </ul>
    {state.error && <div className="gifsnap-picker__error" role="alert">
      <p>{state.error}</p>
      <button type="button" className="gifsnap-picker__button" onClick={() => { if (failedRequest.current) void load(failedRequest.current); }}>Try again</button>
    </div>}
    {!state.error && state.nextPage !== null && <button type="button" className="gifsnap-picker__button gifsnap-picker__more" disabled={state.loading} onClick={() => { if (state.nextPage !== null) void load({ query: search.query, page: state.nextPage, append: true }); }}>{state.loading ? 'Loading…' : 'Load more'}</button>}
    <div className="gifsnap-picker__attribution"><a href="https://gifsnap.com" target="_blank" rel="noopener noreferrer">Powered by GifSnap</a></div>
  </section>;
}
