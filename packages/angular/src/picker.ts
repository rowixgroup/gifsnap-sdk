import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, PLATFORM_ID, inject, signal, type OnChanges, type OnDestroy, type OnInit, type SimpleChanges } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createGifSnapClient, GifSnapError, type GifSnapClient, type GifSnapGif } from '@rowix/gifsnap-js';

export type GifSnapTheme = 'light' | 'dark' | 'system';
export type GifSnapMediaType = 'gif' | 'sticker';
interface RequestInfo { query: string; page: number; append: boolean }
interface PickerState { items: GifSnapGif[]; loading: boolean; error: string; nextPage: number | null }
const defaultClient = createGifSnapClient();
function unique(items: GifSnapGif[]): GifSnapGif[] {
  const ids = new Set<string>(), urls = new Set<string>(), contentIds = new Set<string>();
  return items.filter(item => {
    const identity = typeof item.content_id === 'string' && item.content_id.trim() ? item.content_id : undefined;
    const duplicate = ids.has(item.id) || urls.has(item.url) || (identity !== undefined && contentIds.has(identity));
    ids.add(item.id); urls.add(item.url);
    if (identity !== undefined) contentIds.add(identity);
    return !duplicate;
  });
}

@Component({
  selector: 'gifsnap-picker-image', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (source(); as src) {
    <img [src]="src" alt="" loading="lazy" decoding="async" [width]="gif.width || 240" [height]="gif.height || 180"
      [attr.title]="attempt() > 0 ? 'Animation unavailable; showing preview' : null" (error)="failed($event, src)" />
  } @else { <span>Preview unavailable</span> }`,
  styles: [':host{display:contents}img{display:block;width:100%;height:100%;object-fit:contain}span{padding:8px;text-align:center;color:var(--gs-muted);font-size:12px}'],
})
export class GifSnapImage implements OnChanges {
  @Input({ required: true }) gif!: GifSnapGif;
  readonly attempt = signal(0);
  private sources: string[] = [];
  ngOnChanges(): void { this.sources = [...new Set([this.gif.url, this.gif.preview_url].filter(Boolean))]; this.attempt.set(0); }
  source(): string | undefined { return this.sources[this.attempt()]; }
  failed(event: Event, expected: string): void {
    if (this.source() === expected && (event.target as HTMLImageElement).getAttribute('src') === expected) this.attempt.update(value => value + 1);
  }
}

/** Standalone, styled picker. Search is explicitly submitted; selection retains the API item. */
@Component({
  selector: 'gifsnap-picker', standalone: true, imports: [GifSnapImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './picker.html', styleUrls: ['./picker.css'],
})
export class GifSnapPicker implements OnInit, OnChanges, OnDestroy {
  @Input() theme: GifSnapTheme = 'system';
  @Input() mediaType: GifSnapMediaType = 'gif';
  @Input() pageSize = 24;
  /** Initial value only. User searches are submitted through the form. */
  @Input() initialQuery = '';
  @Input() client: GifSnapClient = defaultClient;
  @Output() readonly gifSelect = new EventEmitter<GifSnapGif>();
  readonly state = signal<PickerState>({ items: [], loading: false, error: '', nextPage: null });
  draft = '';
  query = '';
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private ready = false;
  private destroyed = false;
  private sequence = 0;
  private busy = false;
  private controller: AbortController | null = null;
  private failedRequest: RequestInfo | null = null;
  get mediaLabel(): string { return this.mediaType === 'sticker' ? 'stickers' : 'GIFs'; }
  ngOnInit(): void {
    this.ready = true;
    this.draft = this.initialQuery;
    this.query = this.initialQuery.trim();
    if (this.browser) void this.load({ query: this.query, page: 1, append: false });
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (this.ready && this.browser && (changes['client'] || changes['pageSize'] || changes['mediaType'])) {
      void this.load({ query: this.query, page: 1, append: false });
    }
  }
  ngOnDestroy(): void { this.destroyed = true; ++this.sequence; this.controller?.abort(); this.busy = false; }
  updateDraft(event: Event): void { this.draft = (event.target as HTMLInputElement).value; }
  submit(event: Event): void { event.preventDefault(); this.searchFor(this.draft); }
  reset(): void { this.draft = ''; this.searchFor(''); }
  retry(): void { if (this.failedRequest) void this.load(this.failedRequest); }
  more(): void {
    const nextPage = this.state().nextPage;
    if (nextPage !== null) void this.load({ query: this.query, page: nextPage, append: true });
  }
  select(gif: GifSnapGif): void { this.gifSelect.emit(gif); }
  private searchFor(query: string): void {
    this.query = query.trim();
    void this.load({ query: this.query, page: 1, append: false });
  }
  private async load(request: RequestInfo): Promise<void> {
    if (this.destroyed || !this.browser || (request.append && this.busy)) return;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const current = ++this.sequence;
    this.busy = true;
    this.failedRequest = null;
    const previous = this.state();
    this.state.set({ items: request.append ? previous.items : [], loading: true, error: '', nextPage: request.append ? previous.nextPage : null });
    try {
      const limit = Number.isInteger(this.pageSize) && this.pageSize >= 1 && this.pageSize <= 50 ? this.pageSize : 24;
      const options = { page: request.page, limit, signal: controller.signal };
      const result = this.mediaType === 'sticker'
        ? request.query ? await this.client.searchStickers({ ...options, query: request.query }) : await this.client.trendingStickers(options)
        : request.query ? await this.client.search({ ...options, query: request.query }) : await this.client.trending(options);
      if (controller.signal.aborted || current !== this.sequence || this.destroyed) return;
      const items = unique(request.append ? [...previous.items, ...result.data] : result.data);
      const progressed = result.data.length > 0 && (!request.append || items.length > previous.items.length);
      this.state.set({ items, loading: false, error: '', nextPage: progressed && result.pagination.has_next ? result.pagination.next_page : null });
    } catch (error) {
      if (controller.signal.aborted || current !== this.sequence || this.destroyed) return;
      this.failedRequest = request;
      const message = error instanceof GifSnapError && error.status === 429
        ? `Too many requests. ${error.retryAfterSeconds ? `Try again in ${error.retryAfterSeconds} seconds.` : 'Try again shortly.'}`
        : `Could not load ${this.mediaLabel}. Please try again.`;
      this.state.update(value => ({ ...value, loading: false, error: message }));
    } finally { if (current === this.sequence) this.busy = false; }
  }
}
