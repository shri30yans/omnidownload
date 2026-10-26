// Run the background extractors straight against the live APIs (no browser).
// Usage: node tests/api.mjs   (needs network)
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(tmpdir(), 'omni-router.mjs');
await build({
  entryPoints: ['src/background/extract-router.js'],
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
});
globalThis.chrome = { cookies: { getAll: async () => [] } };
const { extractOnPlatform } = await import(pathToFileURL(out));

const cases = [
  ['twitter', 'https://x.com/NASA/status/1595471051403644929'],
  ['imgur', 'https://imgur.com/a/AjP8JEf'],
  ['imgur', 'https://imgur.com/gallery/some-title-tZoLRk3'],
];
for (const [platform, url] of cases) {
  try {
    const items = await extractOnPlatform(platform, url);
    console.log('PASS', platform, url, '->', items.length, items[0]?.url?.slice(0, 80));
  } catch (e) {
    console.log('FAIL', platform, url, '->', e.message);
  }
}
