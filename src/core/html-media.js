import { mediaItem } from './media-item.js';
import { readJsonLdObjects, walkJson } from './json-ld.js';
import {
  findPlaylistUrls,
  isMasterPlaylist,
  parseMasterPlaylist,
} from './hls.js';

const MEDIA_EXT = /\.(jpe?g|png|gif|webp|avif|mp4|webm|mov|m4v|mkv|mp3|m4a|wav)(\?|$)/i;

const MAX_IMAGES = 40;
const MAX_LINKS = 30;
const MAX_PLAYLISTS = 3;

function kindFromUrl(url) {
  if (/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(url)) return 'image';
  if (/\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(url)) return 'video';
  if (/\.(mp3|m4a|wav)(\?|$)/i.test(url)) return 'audio';
  return 'other';
}

function metaContent(doc, prop) {
  const el = doc.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
  return el?.getAttribute('content')?.trim() || null;
}

function slugFromTitle(doc) {
  const slug = (doc.title || 'video')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug.slice(0, 60) || 'video';
}

function bestImageUrl(img) {
  const srcset = img.getAttribute('srcset');
  if (srcset) {
    const best = srcset
      .split(',')
      .map((part) => part.trim().split(/\s+/))
      .map(([url, d]) => ({ url, w: parseFloat(d) || 1 }))
      .sort((a, b) => b.w - a.w)[0];
    if (best?.url) {
      try {
        return new URL(best.url, img.baseURI).href;
      } catch {
        /* use src */
      }
    }
  }
  return img.currentSrc || img.src;
}

/**
 * @param {Document} doc
 * @param {{ source?: string; labelPrefix?: string }} [opts]
 */
async function hlsItems(doc, opts) {
  const items = [];
  const source = opts?.source ?? 'generic';
  const name = slugFromTitle(doc);
  const perf = typeof performance !== 'undefined' ? performance : null;
  for (const playlistUrl of findPlaylistUrls(doc, perf).slice(0, MAX_PLAYLISTS)) {
    try {
      const res = await fetch(playlistUrl, { credentials: 'omit' });
      if (!res.ok) continue;
      const text = await res.text();
      const renditions = isMasterPlaylist(text)
        ? parseMasterPlaylist(text, playlistUrl)
        : [{ url: playlistUrl, height: null }];
      const variants = renditions.map((v) => {
        const quality = v.height ? `${v.height}p` : 'stream';
        return {
          url: v.url,
          label: quality,
          filename: `${name}${v.height ? `-${v.height}p` : ''}.mp4`,
          hls: true,
        };
      });
      if (!variants.length) continue;
      items.push(
        mediaItem({
          url: variants[0].url,
          label: 'Video (stream → MP4)',
          kind: 'video',
          filename: variants[0].filename,
          source,
          hls: true,
          variants,
        }),
      );
    } catch {
      /* skip */
    }
  }
  return items;
}

/**
 * Scrape direct media URLs from a page document (Open Graph, players, links, etc.).
 * @param {Document} doc
 * @param {{ source?: string; labelPrefix?: string }} [opts]
 */
export async function mediaItemsFromHtmlDocument(doc, opts = {}) {
  const source = opts.source ?? 'generic';
  const prefix = opts.labelPrefix ?? '';
  const items = [];

  const ogVideo =
    metaContent(doc, 'og:video:secure_url') ||
    metaContent(doc, 'og:video:url') ||
    metaContent(doc, 'og:video') ||
    metaContent(doc, 'twitter:player:stream');
  if (ogVideo) {
    items.push(
      mediaItem({
        url: ogVideo,
        label: `${prefix}Linked video`.trim(),
        kind: 'video',
        previewUrl: metaContent(doc, 'og:image') || undefined,
        source,
      }),
    );
  }

  const ogImage = metaContent(doc, 'og:image') || metaContent(doc, 'twitter:image');
  if (ogImage && !items.some((i) => i.url === ogImage)) {
    items.push(
      mediaItem({
        url: ogImage,
        label: `${prefix}Linked image`.trim(),
        kind: 'image',
        source,
      }),
    );
  }

  for (const obj of readJsonLdObjects(doc)) {
    walkJson(obj, (node) => {
      const type = node['@type'];
      const contentUrl = node.contentUrl || node.embedUrl;
      if (typeof contentUrl === 'string' && (MEDIA_EXT.test(contentUrl) || /^https?:\/\//i.test(contentUrl))) {
        items.push(
          mediaItem({
            url: contentUrl,
            label: typeof type === 'string' ? `${prefix}${type}`.trim() : `${prefix}Structured data`.trim(),
            kind: kindFromUrl(contentUrl),
            source,
          }),
        );
      }
    });
  }

  items.push(...(await hlsItems(doc, { source })));

  doc.querySelectorAll('video').forEach((video, i) => {
    const candidates = [{ url: video.currentSrc || video.src, hint: null }];
    video.querySelectorAll('source[src]').forEach((el) => {
      const height = el.getAttribute('size') || el.getAttribute('label') || el.getAttribute('title');
      candidates.push({
        url: el.src,
        hint: height ? `${height}${/\D/.test(height) ? '' : 'p'}` : null,
      });
    });
    for (const { url, hint } of candidates) {
      if (!url || url.startsWith('blob:')) continue;
      items.push(
        mediaItem({
          url,
          label: `${prefix}Video ${i + 1}${hint ? ` ${hint}` : ''}`.trim(),
          kind: 'video',
          source,
        }),
      );
    }
  });

  const images = [];
  doc.querySelectorAll('img').forEach((img, i) => {
    const src = bestImageUrl(img);
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (Math.max(w, h) < 150) return;
    images.push({
      area: w * h,
      item: mediaItem({
        url: src,
        label: img.alt?.trim().slice(0, 60) || `${prefix}Image ${i + 1}`.trim(),
        kind: 'image',
        source,
      }),
    });
  });
  images.sort((a, b) => b.area - a.area);
  items.push(...images.slice(0, MAX_IMAGES).map((x) => x.item));

  let linked = 0;
  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.href;
    if (MEDIA_EXT.test(href) && linked++ < MAX_LINKS) {
      items.push(
        mediaItem({
          url: href,
          label: a.textContent?.trim()?.slice(0, 60) || `${prefix}Linked file`.trim(),
          kind: kindFromUrl(href),
          source,
        }),
      );
    }
  });

  return items;
}

/**
 * @param {string} html
 * @param {string} pageUrl
 */
export async function mediaItemsFromHtml(html, pageUrl, opts = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (doc.querySelector('parsererror')) {
    throw new Error('Could not parse linked page HTML');
  }
  try {
    doc.baseURI = pageUrl;
  } catch {
    /* baseURI may be read-only in some environments */
  }
  return mediaItemsFromHtmlDocument(doc, opts);
}
