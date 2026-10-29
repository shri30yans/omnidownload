// Live YouTube probe: node tests/youtube-live.mjs [videoId...]
// Runs the extension's real extraction code (bundled for Node) against YouTube,
// then checks the URLs it produced actually serve bytes.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(tmpdir(), 'omni-yt.mjs');
await build({
  stdin: {
    contents: `export { fetchPlayerResponse } from './src/core/youtube-innertube.js';
               export { mediaItemsFromPlayer } from './src/core/youtube-streams.js';`,
    resolveDir: process.cwd(),
  },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
});

// Stand in for the browser: same-origin fetch on youtube.com, no page scripts.
const realFetch = globalThis.fetch;
globalThis.document = { scripts: [] };
globalThis.fetch = (url, init) => realFetch(url.startsWith('/') ? `https://www.youtube.com${url}` : url, init);
const { fetchPlayerResponse, mediaItemsFromPlayer } = await import(pathToFileURL(out));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
async function serves(url) {
  const ac = new AbortController();
  const r = await realFetch(url, { headers: { Range: 'bytes=0-65535', 'User-Agent': UA }, signal: ac.signal });
  ac.abort();
  return r.status;
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['jNQXAC9IVRw', 'dQw4w9WgXcQ', 'aqz-KE-bpKQ'];
let failed = 0;
for (const id of ids) {
  try {
    const items = mediaItemsFromPlayer(await fetchPlayerResponse(id));
    const video = items.find((i) => i.kind === 'video');
    const audio = items.find((i) => i.kind === 'audio');
    const top = video?.variants[0];
    const checks = [['video', top?.url], ['audio', top?.audioUrl || audio?.variants[0].url]];
    const codes = await Promise.all(checks.map(async ([n, u]) => `${n}:${u ? await serves(u) : 'none'}`));
    const ok = codes.every((c) => /:20[06]$/.test(c));
    if (!ok) failed++;
    console.log(ok ? 'PASS' : 'FAIL', id, video?.variants.map((v) => v.label.split(' ')[0]).join(','), codes.join(' '));
  } catch (e) {
    failed++;
    console.log('FAIL', id, e.message);
  }
}
process.exit(failed ? 1 : 0);
