import { mediaItem } from './media-item.js';

/**
 * Open Graph / Twitter card tags present on most post pages.
 * @param {Document} doc
 * @param {string} [source]
 */
export function mediaFromPageMeta(doc, source = 'generic') {
  const items = [];
  const meta = (prop) =>
    doc.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.getAttribute('content')?.trim() ||
    null;

  const video =
    meta('og:video:secure_url') || meta('og:video:url') || meta('og:video') || meta('twitter:player:stream');
  const image = meta('og:image') || meta('twitter:image');

  if (video) {
    items.push(
      mediaItem({
        url: video,
        label: 'Page video preview',
        kind: 'video',
        previewUrl: image || undefined,
        source,
      }),
    );
  }
  if (image && !items.some((i) => i.url === image)) {
    items.push(
      mediaItem({
        url: image,
        label: 'Page image preview',
        kind: 'image',
        source,
      }),
    );
  }
  return items;
}
