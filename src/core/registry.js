/**
 * @typedef {object} SiteContext
 * @property {Document} document
 * @property {string} url
 * @property {Location} location
 */

/**
 * @typedef {object} SiteExtractor
 * @property {string} id
 * @property {string[]} hostSuffixes - e.g. ['instagram.com']
 * @property {number} [priority=0] - higher runs before generic
 * @property {(ctx: SiteContext) => Promise<import('./media-item.js').MediaItem[]> | import('./media-item.js').MediaItem[]} extract
 */

/** @type {SiteExtractor[]} */
const extractors = [];

/**
 * @param {SiteExtractor} extractor
 */
export function registerExtractor(extractor) {
  extractors.push(extractor);
  extractors.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/**
 * @param {string} hostname
 */
export function hostMatches(hostname, suffix) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

/**
 * @param {SiteContext} ctx
 * @returns {SiteExtractor[]}
 */
export function extractorsForPage(ctx) {
  const host = ctx.location.hostname.toLowerCase();
  return extractors.filter((ex) =>
    ex.hostSuffixes.some((s) => hostMatches(host, s.toLowerCase())),
  );
}

/** True when a site-specific extractor (not the generic scraper) owns this host. */
export function hasDedicatedExtractor(ctx) {
  return extractorsForPage(ctx).some((ex) => ex.id !== 'generic');
}

/**
 * @typedef {object} CollectMediaResult
 * @property {import('./media-item.js').MediaItem[]} items
 * @property {string | null} [siteError]
 */

/**
 * @param {SiteContext} ctx
 * @returns {Promise<CollectMediaResult>}
 */
export async function collectMedia(ctx) {
  const matched = extractorsForPage(ctx).filter((ex) => ex.id !== 'generic');
  const generic = extractors.find((ex) => ex.id === 'generic');
  let siteError = null;

  const run = async (ex) => {
    try {
      const items = await ex.extract(ctx);
      return items.map((item) => ({ ...item, source: item.source ?? ex.id }));
    } catch (err) {
      console.warn(`[OmniDownload] ${ex.id} extractor failed`, err);
      siteError ??= `${ex.id}: ${err?.message || 'extraction failed'}`;
      return [];
    }
  };

  let flat = (await Promise.all(matched.map(run))).flat();
  // Site extractors only know post/video pages; on feeds, profiles and
  // unsupported hosts fall back to scraping what the page itself shows.
  if (!flat.length && generic && !matched.some((ex) => ex.id === 'youtube')) {
    flat = await run(generic);
  }

  const order = { video: 0, audio: 1, image: 2, other: 3 };
  flat.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
  return { items: flat, siteError };
}
