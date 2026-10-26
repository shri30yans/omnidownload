import { walkJson } from './json-ld.js';

/**
 * Pixel area of an image candidate. Logged-out data omits width/height, but its
 * resized variants carry a size hint in the URL (`s480x480`); the original has
 * no hint at all, so "no size information" means the largest.
 */
function candidateArea(c) {
  if (c.width) return c.width * (c.height || c.width);
  const hint = c.url?.match(/[ps](\d+)x(\d+)/);
  return hint ? Number(hint[1]) * Number(hint[2]) : Infinity;
}

/** Largest candidate; on a tie keep the first, since Instagram lists the biggest first. */
export function bestCandidate(candidates) {
  return candidates.reduce((best, c) => (candidateArea(c) > candidateArea(best) ? c : best));
}

/**
 * Pull media URLs from Instagram-style / GraphQL blobs in page JSON.
 * @param {unknown} root
 * @param {(item: { url: string; kind: 'image'|'video'|'audio'; label: string }) => void} onMedia
 */
export function harvestInstagramGraphJson(root, onMedia) {
  walkJson(root, (node) => {
    if (!node || typeof node !== 'object') return;

    const versions = node.video_versions;
    if (Array.isArray(versions)) {
      const sorted = [...versions].sort((a, b) => (b.height || 0) - (a.height || 0));
      for (const v of sorted) {
        if (typeof v?.url === 'string') {
          onMedia({
            url: v.url,
            kind: 'video',
            label: `Video${v.height ? ` ${v.height}p` : ''}`,
          });
        }
      }
    }

    if (typeof node.video_url === 'string') {
      onMedia({ url: node.video_url, kind: 'video', label: 'Video' });
    }

    const candidates = node.image_versions2?.candidates;
    if (Array.isArray(candidates) && candidates.length) {
      const best = bestCandidate(candidates);
      if (best?.url) {
        onMedia({
          url: best.url,
          kind: 'image',
          label: `Photo${best.width ? ` ${best.width}px` : ''}`,
        });
      }
    }

    if (typeof node.display_url === 'string') {
      onMedia({ url: node.display_url, kind: 'image', label: 'Photo' });
    }

    if (Array.isArray(node.carousel_media)) {
      node.carousel_media.forEach((slide, i) => {
        harvestInstagramGraphJson(slide, (item) => {
          onMedia({ ...item, label: `Slide ${i + 1} — ${item.label}` });
        });
      });
    }
  });
}
