import { MSG } from '../core/messages.js';
import {
  defaultExtension,
  filenameFromUrl,
  sanitizeFilename,
} from '../core/filename.js';

/**
 * @param {import('../core/media-item.js').MediaItem} item
 */
export async function downloadMediaItem(item) {
  const filename =
    item.filename ||
    filenameFromUrl(item.url, `omnidownload-${item.kind}`) ||
    sanitizeFilename(`omnidownload${defaultExtension(item.kind)}`);

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
