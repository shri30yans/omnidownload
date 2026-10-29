import { mediaItem } from './media-item.js';
import { redditPostIdFromUrl } from './reddit-post-id.js';
import { queryAllDeep, queryDeep } from './shadow-dom.js';

const IMAGE = /\.(jpe?g|png|gif|webp)(\?|$)/i;
const REDDIT_MEDIA = /https:\/\/(?:[^"'\s]*\.)?(?:redd\.it|redditmedia\.com)\/[^"'\s]+/gi;

/**
 * @param {Document} doc
 * @param {string} [pageUrl]
 */
export function findShredditPost(doc, pageUrl) {
  const postId = redditPostIdFromUrl(pageUrl || doc.defaultView?.location?.href || '');
  const posts = queryAllDeep(doc.documentElement, 'shreddit-post');
  if (postId) {
    for (const el of posts) {
      const id = el.id || '';
      const pid = el.getAttribute('post-id') || '';
      const permalink = el.getAttribute('permalink') || '';
      if (
        id === `t3_${postId}` ||
        pid === postId ||
        el.getAttribute('thingid') === `t3_${postId}` ||
        permalink.includes(`/comments/${postId}/`)
      ) {
        return el;
      }
    }
  }
  return posts[0] ?? doc.querySelector('shreddit-post');
}

/**
 * Last-resort: Reddit embeds media URLs in inline JSON on comment pages.
 * @param {Document} doc
 * @param {string | null} postId
 */
function mediaUrlsFromInlineJson(doc, postId) {
  const hay = doc.documentElement.innerHTML;
  const slice = postId && hay.includes(postId) ? extractAround(hay, postId, 120_000) : hay.slice(0, 400_000);
  const urls = new Set();
  for (const m of slice.matchAll(REDDIT_MEDIA)) {
    let u = m[0].replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
    if (/\.(mp4|webm|m3u8|jpe?g|png|gif|webp)/i.test(u)) urls.add(u);
  }
  return [...urls];
}

function extractAround(text, needle, radius) {
  const i = text.indexOf(needle);
  if (i < 0) return text.slice(0, radius);
  return text.slice(Math.max(0, i - radius / 2), i + radius / 2);
}

/**
 * @param {Document} doc
 * @param {string} [pageUrl]
 */
export function mediaFromRedditDom(doc, pageUrl) {
  const post = findShredditPost(doc, pageUrl);
  if (!post) return [];
  const items = [];
  const seen = new Set();
  const push = (url, label, kind, filename) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    items.push(
      mediaItem({ url: url.replace(/&amp;/g, '&'), label, kind, filename, source: 'reddit' }),
    );
  };

  const href = post.getAttribute('content-href') || '';
  const type = post.getAttribute('post-type');

  if (type === 'image' && href) push(href, 'Reddit image', 'image');
  if (type === 'gif' && href) push(href, 'Reddit GIF', IMAGE.test(href) ? 'image' : 'video');

  for (const player of queryAllDeep(post, 'shreddit-player-2, shreddit-player')) {
    const packed = player.getAttribute('packaged-media-json');
    if (packed) {
      try {
        const mp4s = JSON.parse(packed)?.playbackMp4s?.permutations || [];
        for (const p of [...mp4s].sort(
          (a, b) => (b.source?.dimensions?.height || 0) - (a.source?.dimensions?.height || 0),
        )) {
          const h = p.source?.dimensions?.height;
          push(p.source?.url, `Reddit video${h ? ` ${h}p` : ''}`, 'video');
        }
      } catch {
        /* ignore */
      }
    }
    const src = player.getAttribute('src');
    if (src) push(src, 'Reddit video (stream)', 'video');
  }

  if (type === 'gallery' || queryDeep(post, 'gallery-carousel')) {
    let n = 0;
    for (const img of queryAllDeep(post, 'gallery-carousel img, gallery-carousel faceplate-img, img')) {
      const src = img.getAttribute('src') || img.getAttribute('data-lazy-src');
      if (!src || !/preview\.redd\.it|i\.redd\.it/i.test(src)) continue;
      n += 1;
      push(src, `Gallery ${n}`, 'image');
    }
  }

  for (const img of queryAllDeep(post, 'img[src*="redd.it"]')) {
    const src = img.getAttribute('src') || '';
    if (src && /preview\.redd\.it|i\.redd\.it/i.test(src)) {
      push(src, 'Reddit image', 'image');
    }
  }

  const postId = redditPostIdFromUrl(pageUrl || '');
  for (const url of mediaUrlsFromInlineJson(doc, postId)) {
    const kind = /\.(mp4|webm|m3u8)/i.test(url) ? 'video' : 'image';
    push(url, kind === 'video' ? 'Reddit video (embedded)' : 'Reddit image (embedded)', kind);
  }

  return items;
}
