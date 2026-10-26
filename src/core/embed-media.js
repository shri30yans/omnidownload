import { walkJson } from './json-ld.js';

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
      const best = candidates.reduce((a, b) => ((a.width || 0) > (b.width || 0) ? a : b));
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
