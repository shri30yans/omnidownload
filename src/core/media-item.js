/**
 * @typedef {'image' | 'video' | 'audio' | 'other'} MediaKind
 */

/**
 * @typedef {object} MediaItem
 * @property {string} url - Direct URL to download (https/blob handled in background).
 * @property {string} label - Short UI label.
 * @property {MediaKind} kind
 * @property {string} [filename] - Suggested filename without path.
 * @property {string} [source] - Site id or 'generic' for debugging.
 * @property {boolean} [hls] - `url` is an HLS media playlist; segments are joined into an MP4.
 */

/**
 * @param {Partial<MediaItem> & { url: string }} partial
 * @returns {MediaItem}
 */
export function mediaItem(partial) {
  const { url, label, kind = 'other', filename, source, hls } = partial;
  if (!url?.trim()) {
    throw new Error('MediaItem requires url');
  }
  return {
    url: url.trim(),
    label: label?.trim() || 'Media',
    kind,
    filename,
    source,
    ...(hls ? { hls } : {}),
  };
}

/**
 * Dedupe by URL, preserve order.
 * @param {MediaItem[]} items
 * @returns {MediaItem[]}
 */
export function dedupeMedia(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = item.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
