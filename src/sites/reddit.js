import { mediaItem } from '../core/media-item.js';
import { pageFetchJson } from '../core/page-fetch.js';
import { mediaFromRedditJson, redditExternalUrl, redditOffsiteLink } from '../core/reddit-json.js';
import { findShredditPost, mediaFromRedditDom } from '../core/reddit-dom.js';
import { redditSlugFromUrl } from '../core/reddit-slug.js';
import { resolveRedditLinkedMedia } from '../core/reddit-linked.js';
import { mediaFromPageMeta } from '../core/page-meta-media.js';
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
  if (!slug) {
    const earlyDom = mediaFromRedditDom(ctx.document, ctx.url);
    if (earlyDom.length) return earlyDom;
    const meta = mediaFromPageMeta(ctx.document, 'reddit');
    if (meta.length) return meta;
    return [];
  }

  const hints = [];
  let json = null;
  try {
    json = await pageFetchJson(`https://www.reddit.com/${slug}/.json?raw_json=1`);
  } catch (err) {
    hints.push(`API: ${err?.message || 'unavailable'}`);
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
    if (external) {
      const { items: linked, error } = await resolveRedditLinkedMedia(external);
      if (linked.length) return linked;
      if (error) hints.push(`link: ${error}`);
    }
  }

  const domItems = mediaFromRedditDom(ctx.document, ctx.url);
  if (domItems.length) return domItems;

  const metaItems = mediaFromPageMeta(ctx.document, 'reddit');
  if (metaItems.length) return metaItems;

  const post = findShredditPost(ctx.document, ctx.url);
  const href = post?.getAttribute('content-href') || '';
  const offsite = redditOffsiteLink(href);
  if (offsite) {
    const { items: linked, error } = await resolveRedditLinkedMedia(offsite);
    if (linked.length) return linked;
    if (error) hints.push(`link: ${error}`);
  }

  if (!post) hints.push('post UI not loaded yet');
  console.warn('[OmniDownload] Reddit extract empty', { slug, hints, url: ctx.url });

  throw new Error(
    hints.length
      ? hints.join(' · ')
      : 'Post still loading or no media — wait a moment, then tap ↻ Refresh',
  );
}

registerExtractor({
  id: 'reddit',
  hostSuffixes: ['reddit.com', 'old.reddit.com', 'redd.it'],
  priority: 50,
  extract: extractReddit,
});
