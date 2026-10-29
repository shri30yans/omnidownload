import { mediaItemsFromHtml } from '../core/html-media.js';
import { dedupeMedia } from '../core/media-item.js';

/**
 * Fetch a link post destination and extract direct media (Open Graph, players, etc.).
 * @param {string} url
 */
export async function resolveLinkedPage(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    credentials: 'omit',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const html = await res.text();
  const finalUrl = res.url || url;
  const items = await mediaItemsFromHtml(html, finalUrl, {
    source: 'reddit-link',
    labelPrefix: 'Linked ',
  });
  return dedupeMedia(items);
}
