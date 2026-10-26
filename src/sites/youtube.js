import { registerExtractor } from '../core/registry.js';
import { mediaItemsFromPlayer } from '../core/youtube-streams.js';
import { fetchIosPlayerResponse } from '../core/youtube-innertube.js';
import { readYoutubePlayerResponse } from '../content/youtube-player-read.js';

/** Video id the page is showing (watch, shorts, embed, youtu.be). */
function pageVideoId(location) {
  if (location.hostname === 'youtu.be') return location.pathname.slice(1) || null;
  const v = new URLSearchParams(location.search).get('v');
  if (v) return v;
  return location.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)?.[1] || null;
}

async function extractYoutube(ctx) {
  const wanted = pageVideoId(ctx.location);
  if (!wanted) return [];
  try {
    return mediaItemsFromPlayer(await fetchIosPlayerResponse(wanted));
  } catch (err) {
    console.warn('[OmniDownload] YouTube player API failed, trying page data', err);
  }
  // Fallback: the page's own player (MAIN world). Asked for this exact id, since
  // after SPA navigation the inline ytInitialPlayerResponse is the first video's.
  return mediaItemsFromPlayer(await readYoutubePlayerResponse(wanted));
}

registerExtractor({
  id: 'youtube',
  hostSuffixes: ['youtube.com', 'youtu.be', 'm.youtube.com'],
  priority: 50,
  extract: extractYoutube,
});
