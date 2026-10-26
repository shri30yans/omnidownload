import { harvestInstagramGraphJson } from './embed-media.js';
import { walkJson } from './json-ld.js';

const MEDIA_KEYS = /video_versions|image_versions2|carousel_media/;

/**
 * Instagram embeds the opened post's data in the page itself, so the first
 * post of a tab can be read with no API call (and without logging in, for
 * public posts). Only the node whose `code` is this post counts: the page
 * also carries related posts.
 *
 * @param {Document} doc
 * @param {string} shortcode
 * @returns {{ url: string; kind: string; label: string }[]}
 */
export function mediaFromInstagramPage(doc, shortcode) {
  for (const script of doc.querySelectorAll('script[type="application/json"]')) {
    const text = script.textContent || '';
    if (!text.includes(shortcode) || !MEDIA_KEYS.test(text)) continue;

    let root;
    try {
      root = JSON.parse(text);
    } catch {
      continue;
    }

    let post = null;
    walkJson(root, (node) => {
      if (!post && node.code === shortcode && MEDIA_KEYS.test(JSON.stringify(node))) post = node;
    });
    if (!post) continue;

    const found = [];
    harvestInstagramGraphJson(post, (m) => found.push(m));
    if (found.length) return found;
  }
  return [];
}
