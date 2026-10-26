import { mediaItem } from '../core/media-item.js';
import { readJsonLdObjects, walkJson } from '../core/json-ld.js';
import { registerExtractor } from '../core/registry.js';
import {
  findPlaylistUrls,
  isMasterPlaylist,
  parseMasterPlaylist,
} from '../core/hls.js';

const MEDIA_EXT = /\.(jpe?g|png|gif|webp|avif|mp4|webm|mov|m4v|mkv|mp3|m4a|wav)(\?|$)/i;

function kindFromUrl(url) {
  if (/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(url)) return 'image';
  if (/\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(url)) return 'video';
  if (/\.(mp3|m4a|wav)(\?|$)/i.test(url)) return 'audio';
  return 'other';
}

const MAX_IMAGES = 40;
const MAX_LINKS = 30;
const MAX_PLAYLISTS = 3;

/** Highest-resolution candidate from srcset, else the plain src. */
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

function metaContent(doc, prop) {
  const el = doc.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
  return el?.getAttribute('content')?.trim() || null;
}

function slugFromTitle(doc) {
  const slug = (doc.title || 'video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug.slice(0, 60) || 'video';
}

/**
 * Adaptive streams (HLS) play through a blob: URL, so the <video> element has
 * nothing to download. List the playlists the page references instead, one item
 * per resolution; they are joined into an MP4 when downloaded.
 *
 * @param {Document} doc
 */
async function hlsItems(doc) {
  const items = [];
  const name = slugFromTitle(doc);
  for (const playlistUrl of findPlaylistUrls(doc, performance).slice(0, MAX_PLAYLISTS)) {
    try {
      const res = await fetch(playlistUrl, { credentials: 'omit' });
      if (!res.ok) continue;
      const text = await res.text();
      const variants = isMasterPlaylist(text)
        ? parseMasterPlaylist(text, playlistUrl)
        : [{ url: playlistUrl, height: null }];
      for (const v of variants) {
        const quality = v.height ? `${v.height}p` : '';
        items.push(
          mediaItem({
            url: v.url,
            label: `Video${quality ? ` ${quality}` : ''} (stream, saved as MP4)`,
            kind: 'video',
            filename: `${name}${quality ? `-${quality}` : ''}.mp4`,
            source: 'generic',
            hls: true,
          }),
        );
      }
    } catch {
      /* unreachable or blocked playlist: skip it */
    }
  }
  return items;
}

/**
 * @param {import('../core/registry.js').SiteContext} ctx
 */
async function extractGeneric(ctx) {
  const { document: doc } = ctx;
  const items = [];

  const ogVideo = metaContent(doc, 'og:video') || metaContent(doc, 'og:video:url');
  if (ogVideo) {
    items.push(
      mediaItem({
        url: ogVideo,
        label: 'Open Graph video',
        kind: 'video',
        source: 'generic',
      }),
    );
  }

  const ogImage = metaContent(doc, 'og:image');
  if (ogImage) {
    items.push(
      mediaItem({
        url: ogImage,
        label: 'Open Graph image',
        kind: 'image',
        source: 'generic',
      }),
    );
  }

  for (const obj of readJsonLdObjects(doc)) {
    walkJson(obj, (node) => {
      const type = node['@type'];
      const contentUrl = node.contentUrl || node.embedUrl;
      if (typeof contentUrl === 'string' && MEDIA_EXT.test(contentUrl)) {
        items.push(
          mediaItem({
            url: contentUrl,
            label: typeof type === 'string' ? type : 'Structured data',
            kind: kindFromUrl(contentUrl),
            source: 'generic',
          }),
        );
      }
    });
  }

  items.push(...(await hlsItems(doc)));

  doc.querySelectorAll('video').forEach((video, i) => {
    /** @type {{ url: string, hint: string | null }[]} */
    const candidates = [{ url: video.currentSrc || video.src, hint: null }];
    video.querySelectorAll('source[src]').forEach((el) => {
      const height = el.getAttribute('size') || el.getAttribute('label') || el.getAttribute('title');
      candidates.push({ url: el.src, hint: height ? `${height}${/\D/.test(height) ? '' : 'p'}` : null });
    });
    for (const { url, hint } of candidates) {
      if (!url || url.startsWith('blob:')) continue;
      items.push(
        mediaItem({
          url,
          label: `Video ${i + 1}${hint ? ` ${hint}` : ''}`,
          kind: 'video',
          source: 'generic',
        }),
      );
    }
  });

  // Largest first; skip icons, avatars and tracking pixels.
  const images = [];
  doc.querySelectorAll('img').forEach((img, i) => {
    const src = bestImageUrl(img);
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (Math.max(w, h) < 150) return;
    images.push({ area: w * h, item: mediaItem({
      url: src,
      label: img.alt?.trim().slice(0, 60) || `Image ${i + 1}`,
      kind: 'image',
      source: 'generic',
    }) });
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
          label: a.textContent?.trim()?.slice(0, 60) || 'Linked file',
          kind: kindFromUrl(href),
          source: 'generic',
        }),
      );
    }
  });

  return items;
}

registerExtractor({
  id: 'generic',
  hostSuffixes: [''], // never matched by host — merged separately
  priority: -100,
  extract: extractGeneric,
});

export { extractGeneric };
