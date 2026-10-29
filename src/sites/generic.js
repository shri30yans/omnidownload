import { mediaItemsFromHtmlDocument } from '../core/html-media.js';
import { registerExtractor } from '../core/registry.js';

/**
 * @param {import('../core/registry.js').SiteContext} ctx
 */
async function extractGeneric(ctx) {
  return mediaItemsFromHtmlDocument(ctx.document, { source: 'generic' });
}

registerExtractor({
  id: 'generic',
  hostSuffixes: [''],
  priority: -100,
  extract: extractGeneric,
});

export { extractGeneric };
