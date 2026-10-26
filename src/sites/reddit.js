import { mediaItem } from '../core/media-item.js';
import { pageFetchJson } from '../core/page-fetch.js';
import { mediaFromRedditJson, redditExternalUrl } from '../core/reddit-json.js';
import { mediaFromRedditDom } from '../core/reddit-dom.js';
import { redditSlugFromUrl } from '../core/reddit-slug.js';
import { extractViaPlatform } from '../core/platform-client.js';
import { MSG } from '../core/messages.js';
import { registerExtractor } from '../core/registry.js';

/** Reddit serves video and audio as separate files; find the audio next to a DASH video URL. */
async function redditAudioFor(videoUrl) {
  const base = videoUrl.replace(/DASH_[^/?]+\.mp4.*$/, '');
  if (base === videoUrl) return null;
  for (const name of ['DASH_AUDIO_128.mp4', 'DASH_audio.mp4', 'DASH_AUDIO_64.mp4']) {
    const url = base + name;
    const res = await chrome.runtime.sendMessage({ type: MSG.FETCH_HEAD, url }).catch(() => null);
    if (res?.ok) return mediaItem({ url, label: 'Reddit audio track', kind: 'audio' });
  }
  return null;
}

async function extractReddit(ctx) {
  const slug = redditSlugFromUrl(ctx.url);
  if (!slug) return [];

  let json = null;
  try {
    json = await pageFetchJson(`/${slug}/.json?raw_json=1`);
  } catch (err) {
    console.warn('[OmniDownload] Reddit JSON unavailable, reading the page instead', err.message);
  }

  if (json) {
    const items = mediaFromRedditJson(json).map((r) => mediaItem(r));
    const video = items.find((i) => i.kind === 'video' && /DASH_/.test(i.url));
    if (video) {
      const audio = await redditAudioFor(video.url);
      if (audio) items.push(audio);
    }
    if (items.length) return items;

    const external = redditExternalUrl(json);
    if (external && /imgur\.com/i.test(external)) {
      return extractViaPlatform('imgur', external);
    }
  }

  return mediaFromRedditDom(ctx.document);
}

registerExtractor({
  id: 'reddit',
  hostSuffixes: ['reddit.com', 'old.reddit.com', 'redd.it'],
  priority: 50,
  extract: extractReddit,
});
