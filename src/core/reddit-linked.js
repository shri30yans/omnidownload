import { mediaItem } from './media-item.js';
import { platformForUrl } from './platform-hosts.js';
import { extractViaPlatform } from './platform-client.js';
import { MSG } from './messages.js';

/**
 * Resolve off-site URLs from Reddit posts (link posts, embedded players, etc.).
 * @param {string} externalUrl
 * @returns {Promise<{ items: import('./media-item.js').MediaItem[]; error: string | null }>}
 */
export async function resolveRedditLinkedMedia(externalUrl) {
  const platform = platformForUrl(externalUrl);
  if (platform) {
    try {
      const items = await extractViaPlatform(platform, externalUrl);
      if (items.length) {
        return {
          items: items.map((item) =>
            mediaItem({ ...item, source: item.source ?? 'reddit-link' }),
          ),
          error: null,
        };
      }
    } catch (err) {
      console.warn('[OmniDownload] platform link extract failed', err);
      return { items: [], error: err?.message || 'platform extract failed' };
    }
  }

  const res = await chrome.runtime
    .sendMessage({ type: MSG.RESOLVE_LINKED_PAGE, url: externalUrl })
    .catch((err) => ({ ok: false, error: err?.message || 'extension unavailable' }));
  if (res?.ok && res.items?.length) {
    return {
      items: res.items.map((item) =>
        mediaItem({ ...item, source: item.source ?? 'reddit-link' }),
      ),
      error: null,
    };
  }

  return {
    items: [],
    error: res?.error || 'linked page had no downloadable media',
  };
}
