import muxjs from 'mux.js';
import { parseMediaPlaylist } from '../core/hls.js';
import { flattenFragmentedMp4 } from '../core/mp4-flatten.js';
import { saveBlob } from './save-blob.js';

const CONCURRENCY = 4;

async function fetchOk(url, type) {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`Could not fetch part of the video (HTTP ${res.status})`);
  return type === 'text' ? res.text() : new Uint8Array(await res.arrayBuffer());
}

/** Run `task` over `items` with a few in flight at once, keeping results in order. */
async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await task(items[i], i);
      }
    }),
  );
  return results;
}

/** Repackage MPEG-TS segments as one normal MP4 that any player, including QuickTime, opens. */
function transmux(tsSegments) {
  const transmuxer = new muxjs.mp4.Transmuxer();
  let init = null;
  const fragments = [];
  transmuxer.on('data', (out) => {
    init ??= out.initSegment;
    fragments.push(out.data);
  });
  for (const ts of tsSegments) {
    transmuxer.push(ts);
    transmuxer.flush();
  }
  if (!init) throw new Error('Could not convert this video to MP4.');
  return new Blob(flattenFragmentedMp4(init, fragments), { type: 'video/mp4' });
}

/**
 * Download every segment of a plain HLS stream, join them into one MP4 and
 * hand it to the browser. Runs in the page so the site's own origin is used.
 *
 * @param {string} playlistUrl media playlist (one rendition)
 * @param {string} filename
 * @param {(fraction: number) => void} [onProgress]
 */
export async function downloadHls(playlistUrl, filename, onProgress = () => {}) {
  const { segments } = parseMediaPlaylist(await fetchOk(playlistUrl, 'text'), playlistUrl);

  let done = 0;
  const data = await mapLimit(segments, CONCURRENCY, async (url) => {
    const bytes = await fetchOk(url, 'bytes');
    onProgress(++done / segments.length);
    return bytes;
  });

  saveBlob(transmux(data), filename.replace(/\.(ts|m3u8)$/i, '') + (/\.mp4$/i.test(filename) ? '' : '.mp4'));
  return { ok: true };
}
