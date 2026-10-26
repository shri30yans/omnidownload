/**
 * Minimal HLS (m3u8) parsing: enough to list the renditions of a master
 * playlist and the segments of a plain VOD media playlist.
 */

const resolve = (ref, base) => new URL(ref.trim(), base).href;

/** @param {string} text */
export function isMasterPlaylist(text) {
  return text.includes('#EXT-X-STREAM-INF');
}

/**
 * @param {string} text
 * @param {string} baseUrl
 * @returns {{ url: string, height: number | null, bandwidth: number }[]} best first
 */
export function parseMasterPlaylist(text, baseUrl) {
  const lines = text.split(/\r?\n/);
  const variants = [];
  lines.forEach((line, i) => {
    if (!line.startsWith('#EXT-X-STREAM-INF')) return;
    const next = lines.slice(i + 1).find((l) => l.trim() && !l.startsWith('#'));
    if (!next) return;
    const res = line.match(/RESOLUTION=(\d+)x(\d+)/);
    variants.push({
      url: resolve(next, baseUrl),
      height: res ? Number(res[2]) : null,
      bandwidth: Number(line.match(/BANDWIDTH=(\d+)/)?.[1] || 0),
    });
  });
  return variants.sort((a, b) => (b.height || 0) - (a.height || 0) || b.bandwidth - a.bandwidth);
}

/**
 * @param {string} text
 * @param {string} baseUrl
 * @returns {{ segments: string[], duration: number }}
 * @throws if the stream is encrypted or live
 */
export function parseMediaPlaylist(text, baseUrl) {
  const key = text.match(/#EXT-X-KEY:(.*)/)?.[1];
  if (key && !/METHOD=NONE/.test(key)) {
    throw new Error('This stream is encrypted and cannot be saved.');
  }
  if (!/#EXT-X-ENDLIST/.test(text)) {
    throw new Error('Live streams cannot be saved.');
  }
  const segments = [];
  let duration = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('#EXTINF:')) duration += parseFloat(line.slice(8)) || 0;
    else if (line.trim() && !line.startsWith('#')) segments.push(resolve(line, baseUrl));
  }
  if (!segments.length) throw new Error('The playlist has no segments.');
  return { segments, duration };
}

const PLAYLIST_URL = /https?:(?:\\?\/){2}[^"'\s\\<>]+?\.m3u8[^"'\s\\<>]*/g;

/**
 * Playlist URLs a page references: its markup (players often embed the URL in
 * page data), the requests it already made, and its media elements.
 *
 * @param {Document} doc
 * @param {Performance} perf
 * @returns {string[]}
 */
export function findPlaylistUrls(doc, perf) {
  const found = new Set();
  const add = (u) => u && found.add(u.replace(/\\\//g, '/').replace(/&amp;/g, '&'));

  for (const m of doc.documentElement.outerHTML.matchAll(PLAYLIST_URL)) add(m[0]);
  for (const r of perf.getEntriesByType('resource')) if (/\.m3u8(\?|$)/i.test(r.name)) add(r.name);
  doc.querySelectorAll('video[src], source[src]').forEach((el) => {
    if (/\.m3u8(\?|$)/i.test(el.src)) add(el.src);
  });
  return [...found];
}
