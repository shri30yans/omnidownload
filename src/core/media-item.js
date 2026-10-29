/**
 * @typedef {'image' | 'video' | 'audio' | 'other'} MediaKind
 */

/**
 * One quality/format choice for the same asset (e.g. 1080p vs 720p, or M4A vs MP3).
 * Same content is identified by living on one MediaItem — not by separate list rows.
 *
 * @typedef {object} MediaVariant
 * @property {string} url
 * @property {string} label - Short picker label (e.g. "1080p", "128kbps M4A", "MP3").
 * @property {string} [filename]
 * @property {boolean} [hls]
 * @property {'mp3'} [convert] - Re-encode after fetch (audio → MP3).
 * @property {string} [audioUrl] - Separate audio stream to join into `url` (video-only) as one MP4.
 * @property {number} [totalBytes] - Combined size, for progress.
 */

/**
 * @typedef {object} MediaItem
 * @property {string} url - Direct URL to download (https/blob handled in background).
 * @property {string} label - Short UI label.
 * @property {MediaKind} kind
 * @property {string} [filename] - Suggested filename without path.
 * @property {string} [source] - Site id or 'generic' for debugging.
 * @property {boolean} [hls] - `url` is an HLS media playlist; segments are joined into an MP4.
 * @property {string} [previewUrl] - Optional thumbnail when it differs from the download `url`.
 * @property {MediaVariant[]} [variants] - Alternate resolutions/formats of this same item.
 */

/**
 * @param {Partial<MediaItem> & { url: string }} partial
 * @returns {MediaItem}
 */
export function mediaItem(partial) {
  const { url, label, kind = 'other', filename, source, hls, previewUrl, variants } = partial;
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
    ...(previewUrl?.trim() ? { previewUrl: previewUrl.trim() } : {}),
    ...(variants?.length ? { variants } : {}),
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

/**
 * Filename with a forced extension (keeps the stem).
 * @param {string | undefined} name
 * @param {string} ext - with leading dot, e.g. ".mp3"
 */
export function withExtension(name, ext) {
  const base = (name || 'audio').replace(/\.[^.]+$/, '');
  return `${base}${ext}`;
}
