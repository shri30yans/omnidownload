import { harvestInstagramGraphJson } from '../core/embed-media.js';
import { shortcodeFromInstagramUrl, shortcodeToMediaId } from '../core/instagram-id.js';
import { mediaItem } from '../core/media-item.js';
import { pageFetchJson } from '../core/page-fetch.js';
import { registerExtractor } from '../core/registry.js';

const IG_APP_ID = '936619743392459';

function itemsFrom(root) {
  const rows = [];
  harvestInstagramGraphJson(root, (m) => rows.push(mediaItem(m)));
  return rows;
}

/**
 * Instagram no longer serves post data to logged-out API calls (yt-dlp and
 * cobalt both need a session too). From inside the visitor's own logged-in
 * tab the web API works, so ask it as the page would.
 */
async function extractInstagram(ctx) {
  const shortcode = shortcodeFromInstagramUrl(ctx.url);
  if (!shortcode) return [];

  const info = await pageFetchJson(`/api/v1/media/${shortcodeToMediaId(shortcode)}/info/`, {
    headers: { 'X-IG-App-ID': IG_APP_ID },
  }).catch((err) => {
    throw new Error(`Instagram needs you to be logged in to read this post (${err.message})`);
  });

  const items = itemsFrom(info?.items?.[0]);
  if (!items.length) throw new Error('Instagram returned no media for this post');
  return items;
}

registerExtractor({
  id: 'instagram',
  hostSuffixes: ['instagram.com'],
  priority: 50,
  extract: extractInstagram,
});
