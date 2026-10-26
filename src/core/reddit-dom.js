import { mediaItem } from './media-item.js';

const IMAGE = /\.(jpe?g|png|gif|webp)(\?|$)/i;

/**
 * Read media straight from Reddit's rendered post (<shreddit-post>), for when
 * the JSON API refuses us. Whatever the visitor can see, we can list.
 *
 * @param {Document} doc
 */
export function mediaFromRedditDom(doc) {
  const post = doc.querySelector('shreddit-post');
  if (!post) return [];
  const items = [];
  const push = (url, label, kind, filename) => {
    if (url) items.push(mediaItem({ url: url.replace(/&amp;/g, '&'), label, kind, filename }));
  };

  const href = post.getAttribute('content-href') || '';
  const type = post.getAttribute('post-type');

  if (type === 'image' && href) push(href, 'Reddit image', 'image');
  if (type === 'gif' && href) push(href, 'Reddit GIF', IMAGE.test(href) ? 'image' : 'video');

  const player = post.querySelector('shreddit-player-2, shreddit-player');
  if (player) {
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
        /* fall through to src */
      }
    }
    const src = player.getAttribute('src');
    if (src && !items.some((i) => i.kind === 'video')) push(src, 'Reddit video (HLS)', 'video');
  }

  if (type === 'gallery' || post.querySelector('gallery-carousel')) {
    const seen = new Set();
    post.querySelectorAll('gallery-carousel img, gallery-carousel faceplate-img').forEach((img) => {
      const src = img.getAttribute('src') || img.getAttribute('data-lazy-src');
      if (!src || seen.has(src)) return;
      seen.add(src);
      push(src, `Gallery ${seen.size}`, 'image');
    });
  }
  return items;
}
