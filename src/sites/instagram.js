import { harvestInstagramGraphJson } from '../core/embed-media.js';
import { shortcodeFromInstagramUrl, shortcodeToMediaId } from '../core/instagram-id.js';
import { mediaFromInstagramPage } from '../core/instagram-page.js';
import { mediaItem } from '../core/media-item.js';
import { pageFetchJson } from '../core/page-fetch.js';
import { registerExtractor } from '../core/registry.js';

const GRAPHQL_DOC_ID = '8845758582119845';
const GRAPHQL_NAME = 'PolarisPostActionLoadPostQueryQuery';

/** Headers the Instagram web app sends with its own API calls (same set yt-dlp and cobalt use). */
const API_HEADERS = {
  'X-IG-App-ID': '936619743392459',
  'X-ASBD-ID': '359341',
  'X-IG-WWW-Claim': '0',
  'X-Requested-With': 'XMLHttpRequest',
};

function itemsFrom(root) {
  const rows = [];
  harvestInstagramGraphJson(root, (m) => rows.push(mediaItem(m)));
  return rows;
}

const fromPage = async (shortcode) =>
  mediaFromInstagramPage(document, shortcode).map((m) => mediaItem(m));

async function fromMediaInfo(shortcode) {
  const info = await pageFetchJson(`/api/v1/media/${shortcodeToMediaId(shortcode)}/info/`, {
    headers: API_HEADERS,
  });
  return itemsFrom(info?.items?.[0]);
}

async function fromGraphql(shortcode) {
  const lsd = document.documentElement.innerHTML.match(/\["LSD",\[\],\{"token":"([^"]+)"/)?.[1];
  const data = await pageFetchJson('/graphql/query/', {
    method: 'POST',
    headers: {
      ...API_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-FB-Friendly-Name': GRAPHQL_NAME,
      ...(lsd ? { 'X-FB-LSD': lsd } : {}),
    },
    body: new URLSearchParams({
      ...(lsd ? { lsd } : {}),
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: GRAPHQL_NAME,
      server_timestamps: 'true',
      doc_id: GRAPHQL_DOC_ID,
      variables: JSON.stringify({
        shortcode,
        fetch_tagged_user_count: null,
        hoisted_comment_id: null,
        hoisted_reply_id: null,
      }),
    }),
  });
  return itemsFrom(data?.data?.xdt_shortcode_media ?? data?.data);
}

/**
 * Cheapest source first: the data already embedded in the page, then the web
 * API as the logged-in visitor, then the GraphQL query. Running inside the
 * tab means the visitor's own session cookies are used.
 */
async function extractInstagram(ctx) {
  const shortcode = shortcodeFromInstagramUrl(ctx.url);
  if (!shortcode) return [];

  const errors = [];
  for (const method of [fromPage, fromMediaInfo, fromGraphql]) {
    try {
      const items = await method(shortcode);
      if (items.length) return items;
      errors.push(`${method.name}: no media`);
    } catch (err) {
      errors.push(`${method.name}: ${err.message}`);
    }
  }
  throw new Error(`Could not read this post. Are you logged in to Instagram? (${errors.join('; ')})`);
}

registerExtractor({
  id: 'instagram',
  hostSuffixes: ['instagram.com'],
  priority: 50,
  extract: extractInstagram,
});
