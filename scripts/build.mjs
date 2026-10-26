import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const manifest = JSON.parse(
  readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'),
);
const versionDefine = {
  __OMNIDOWNLOAD_VERSION__: JSON.stringify(manifest.version),
};

await mkdir(new URL('../dist', import.meta.url), { recursive: true });

const common = {
  bundle: true,
  sourcemap: true,
  target: ['chrome120'],
  logLevel: 'info',
};

const contentCtx = await esbuild.context({
  ...common,
  entryPoints: ['src/content/main.js'],
  outfile: 'dist/content.bundle.js',
  format: 'iife',
  platform: 'browser',
  define: versionDefine,
});

const backgroundCtx = await esbuild.context({
  ...common,
  entryPoints: ['src/background/service-worker.js'],
  outfile: 'dist/background.js',
  format: 'esm',
  platform: 'browser',
});

if (watch) {
  await Promise.all([contentCtx.watch(), backgroundCtx.watch()]);
  console.log('[OmniDownload] watching…');
} else {
  await Promise.all([contentCtx.rebuild(), backgroundCtx.rebuild()]);
  await Promise.all([contentCtx.dispose(), backgroundCtx.dispose()]);
}
