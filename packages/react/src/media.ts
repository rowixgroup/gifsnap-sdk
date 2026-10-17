/** A verified animation supplied by the API; a legacy preview_url can be still. */
export interface GifSnapAnimatedPreview {
  url: string;
  mime_type: 'image/gif' | 'image/webp' | 'video/mp4' | 'video/webm';
  width: number;
  height: number;
  byte_size?: number;
  animated: true;
}
const extensions = { 'image/gif': '.gif', 'image/webp': '.webp', 'video/mp4': '.mp4', 'video/webm': '.webm' } as const;
export function parseAnimatedPreview(value: unknown): GifSnapAnimatedPreview | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (row.animated !== true || typeof row.url !== 'string' || typeof row.mime_type !== 'string' ||
      !Object.prototype.hasOwnProperty.call(extensions, row.mime_type)) return undefined;
  if (![row.width, row.height].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n > 0 && n <= 480) ||
      (row.byte_size !== undefined && !(typeof row.byte_size === 'number' && Number.isSafeInteger(row.byte_size) && row.byte_size > 0 && row.byte_size <= 524288))) return undefined;
  try {
    const url = new URL(row.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    const extension = url.pathname.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
    if (extension && extension !== extensions[row.mime_type as keyof typeof extensions]) return undefined;
  } catch { return undefined; }
  return { url: row.url, mime_type: row.mime_type as GifSnapAnimatedPreview['mime_type'], width: row.width as number,
    height: row.height as number, animated: true, ...(row.byte_size === undefined ? {} : { byte_size: row.byte_size as number }) };
}

/** Use for image pickers. Keep gif.url unchanged when sending or selecting. */
export function gifImageSources(gif: { url: string; preview_url: string; animated_preview?: unknown }): string[] {
  const small = parseAnimatedPreview(gif.animated_preview);
  const preview = small?.mime_type.startsWith('image/') ? small.url : undefined;
  return [...new Set([preview, gif.url, gif.preview_url].filter((url): url is string => Boolean(url)))];
}
