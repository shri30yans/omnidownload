import { MSG } from '../core/messages.js';
import { downloadHls } from './hls-download.js';
import { downloadJoined } from './dash-download.js';
import { encodeMp3 } from './mp3-convert.js';
import {
  defaultExtension,
  filenameFromUrl,
  sanitizeFilename,
} from '../core/filename.js';
import { withExtension } from '../core/media-item.js';

/**
 * @param {import('../core/media-item.js').MediaItem & { convert?: 'mp3' }} item
 * @param {(fraction: number) => void} [onProgress]
 */
export async function downloadMediaItem(item, onProgress) {
  const filename =
    item.filename ||
    filenameFromUrl(item.url, `omnidownload-${item.kind}`) ||
    sanitizeFilename(`omnidownload${defaultExtension(item.kind)}`);

  if (item.convert === 'mp3') {
    return downloadAsMp3(item.url, withExtension(filename, '.mp3'), onProgress);
  }

  if (item.audioUrl) return downloadJoined(item, filename, onProgress);

  if (item.hls) return downloadHls(item.url, filename, onProgress);

  if (item.url.startsWith('blob:')) {
    // A blob: URL only exists in this page, so save it from here.
    const a = document.createElement('a');
    a.href = item.url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { ok: true };
  }

  return chrome.runtime.sendMessage({
    type: MSG.DOWNLOAD,
    url: item.url,
    filename,
  });
}

/**
 * @param {string} url
 * @param {string} filename
 * @param {(fraction: number) => void} [onProgress]
 */
async function downloadAsMp3(url, filename, onProgress) {
  onProgress?.(0.02);
  const fetched = await chrome.runtime.sendMessage({ type: MSG.FETCH_BYTES, url });
  if (!fetched?.ok) throw new Error(fetched?.error || 'Could not fetch audio');
  onProgress?.(0.3);
  const mp3 = await encodeMp3(fetched.data, (f) => onProgress?.(0.3 + f * 0.65));
  onProgress?.(0.97);
  return chrome.runtime.sendMessage({
    type: MSG.DOWNLOAD_BYTES,
    data: mp3,
    filename,
    mimeType: 'audio/mpeg',
  });
}
