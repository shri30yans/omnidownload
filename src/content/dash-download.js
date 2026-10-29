import { mergeDashMp4 } from '../core/mp4-merge.js';
import { saveBlob } from './save-blob.js';

/** YouTube throttles or refuses single huge requests; ranged chunks are what its own player sends. */
const CHUNK = 8 * 1024 * 1024;

/** One request, tried up to three times on network errors and 5xx (YouTube drops connections now and then). */
async function fetchWithRetry(url, headers) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { credentials: 'omit', headers });
      if (res.status < 500 || attempt === 3) return res;
    } catch (err) {
      if (attempt === 3) throw err;
    }
    await new Promise((r) => setTimeout(r, 400 * attempt));
  }
}

/**
 * Download `url` in ranged chunks, reporting bytes as they arrive. The end is
 * the first chunk shorter than asked for (Content-Range is not readable
 * cross-origin, so the length is not taken from it).
 */
async function fetchRanged(url, onBytes) {
  const parts = [];
  for (let start = 0; ; ) {
    const res = await fetchWithRetry(url, { Range: `bytes=${start}-${start + CHUNK - 1}` });
    if (res.status === 416 && parts.length) break; // asked past the end
    if (!res.ok) throw new Error(`Could not fetch the video (HTTP ${res.status}). Refresh the page and try again.`);
    const chunk = new Uint8Array(await res.arrayBuffer());
    parts.push(chunk);
    start += chunk.length;
    onBytes(chunk.length);
    if (chunk.length < CHUNK || res.status === 200) break;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) out.set(p, o), (o += p.length);
  return out;
}

/**
 * Fetch a video-only and an audio-only stream, join them into one MP4 and save it.
 *
 * @param {{ url: string, audioUrl: string, totalBytes?: number }} source
 * @param {string} filename
 * @param {(fraction: number) => void} [onProgress]
 */
export async function downloadJoined(source, filename, onProgress = () => {}) {
  let received = 0;
  const total = source.totalBytes || 0;
  const tick = (n) => {
    received += n;
    if (total) onProgress(Math.min(0.95, received / total));
  };
  const [video, audio] = await Promise.all([fetchRanged(source.url, tick), fetchRanged(source.audioUrl, tick)]);
  onProgress(0.97);
  saveBlob(new Blob(mergeDashMp4(video, audio), { type: 'video/mp4' }), filename);
  return { ok: true };
}
