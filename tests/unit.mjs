// Pure-function tests: node --test tests/unit.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaItemsFromPlayer } from '../src/core/youtube-streams.js';
import { mergePlayerResponses } from '../src/core/youtube-innertube.js';
import { mediaFromRedditJson, redditExternalUrl, redditOffsiteLink } from '../src/core/reddit-json.js';
import { shortcodeToMediaId, shortcodeFromInstagramUrl } from '../src/core/instagram-id.js';
import { bestCandidate, harvestInstagramGraphJson } from '../src/core/embed-media.js';
import { sanitizeFilename } from '../src/core/filename.js';
import { isMasterPlaylist, parseMasterPlaylist, parseMediaPlaylist } from '../src/core/hls.js';

const fmt = (o) => ({ mimeType: 'video/mp4; codecs="avc1"', ...o });

test('youtube: skips signatureCipher formats, never builds unsigned urls', () => {
  const player = { playabilityStatus: { status: 'OK' }, videoDetails: { videoId: 'x' },
    streamingData: { adaptiveFormats: [fmt({ itag: 1, signatureCipher: 'url=https%3A%2F%2Fa&s=zz', height: 720 })] } };
  assert.throws(() => mediaItemsFromPlayer(player), /signature-protected/);
});

test('youtube: one video row, one audio row; resolutions are variants', () => {
  const player = { playabilityStatus: { status: 'OK' }, videoDetails: { videoId: 'x', title: 'My: Clip?' }, streamingData: {
    formats: [fmt({ itag: 18, url: 'https://a/18', height: 360 })],
    adaptiveFormats: [
      { itag: 248, mimeType: 'video/webm; codecs="vp9"', url: 'https://a/248', height: 1080 },
      fmt({ itag: 137, url: 'https://a/137', height: 1080, contentLength: '5000000' }),
      fmt({ itag: 134, url: 'https://a/134', height: 360 }),
      fmt({ itag: 399, mimeType: 'video/mp4; codecs="av01"', url: 'https://a/399', height: 1080 }),
      { itag: 140, mimeType: 'audio/mp4; codecs="mp4a"', url: 'https://a/140', bitrate: 130000 },
      { itag: 251, mimeType: 'audio/webm; codecs="opus"', url: 'https://a/251', bitrate: 140000 },
    ] } };
  const items = mediaItemsFromPlayer(player);
  assert.equal(items.length, 2);
  assert.equal(items[0].kind, 'video');
  assert.equal(items[0].label, 'My_ Clip_');
  assert.equal(items[1].kind, 'audio');
  const v = items[0].variants;
  assert.deepEqual(v.map((x) => x.url), ['https://a/137', 'https://a/18']);
  assert.equal(v[0].audioUrl, 'https://a/140');
  assert.equal(v[1].audioUrl, undefined);
  assert.match(v[0].label, /^1080p/);
  assert.equal(v[0].filename, 'My_ Clip_ 1080p.mp4');
  assert.deepEqual(items[1].variants.map((x) => x.url), ['https://a/140', 'https://a/251']);
});

test('youtube: unplayable video surfaces the reason', () => {
  assert.throws(() => mediaItemsFromPlayer({ streamingData: {}, playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in' } }), /Sign in/);
});

test('reddit: video, image, gallery, gifv, crosspost', () => {
  const post = (d) => [{ data: { children: [{ data: d }] } }];
  assert.equal(mediaFromRedditJson(post({ secure_media: { reddit_video: { fallback_url: 'https://v.redd.it/a/DASH_720.mp4?source=fallback' } } }))[0].kind, 'video');
  assert.equal(mediaFromRedditJson(post({ url: 'https://i.redd.it/x.jpg' }))[0].kind, 'image');
  const g = mediaFromRedditJson(post({ media_metadata: { a: { e: 'Image', s: { u: 'https://preview.redd.it/a.jpg?x=1&amp;y=2' } }, b: { e: 'AnimatedImage', s: { gif: 'https://i.redd.it/b.gif' } } } }));
  assert.equal(g[0].url, 'https://preview.redd.it/a.jpg?x=1&y=2');
  assert.equal(g[1].kind, 'video');
  const cross = mediaFromRedditJson(post({ crosspost_parent_list: [{ url: 'https://i.redd.it/orig.png' }] }));
  assert.equal(cross[0].url, 'https://i.redd.it/orig.png');
  assert.equal(redditExternalUrl(post({ url: 'https://imgur.com/a/abc' })), 'https://imgur.com/a/abc');
  assert.equal(redditOffsiteLink('https://example.watch/foo'), 'https://example.watch/foo');
  assert.equal(redditOffsiteLink('https://i.redd.it/x.jpg'), null);
});

test('instagram: shortcode -> media id, url forms', () => {
  assert.equal(shortcodeToMediaId('BsOGulcndj-'), '1949525278281554174');
  assert.equal(shortcodeFromInstagramUrl('https://www.instagram.com/reel/ABC_def-1/?igsh=x'), 'ABC_def-1');
  assert.equal(shortcodeFromInstagramUrl('https://www.instagram.com/reels/ABC_def-1/'), 'ABC_def-1');
  assert.equal(shortcodeFromInstagramUrl('https://www.instagram.com/someuser/'), null);
  assert.equal(shortcodeFromInstagramUrl('https://www.instagram.com/direct/t/17842434503564216/'), null);
});

test('instagram: harvest carousel picks best image + videos', () => {
  const out = [];
  harvestInstagramGraphJson({ carousel_media: [
    { image_versions2: { candidates: [{ url: 'https://s/small', width: 100 }, { url: 'https://s/big', width: 1080 }] } },
    { video_versions: [{ url: 'https://s/v480', height: 480 }, { url: 'https://s/v1080', height: 1080 }] } ] }, (m) => out.push(m));
  assert.ok(out.some((m) => m.url === 'https://s/big'));
  assert.ok(!out.some((m) => m.url === 'https://s/small'));
  assert.equal(out.find((m) => m.kind === 'video').url, 'https://s/v1080');
});

test('filename: strips illegal characters and caps length', () => {
  assert.equal(sanitizeFilename('a/b:c?.mp4'), 'a_b_c_.mp4');
  assert.ok(sanitizeFilename('x'.repeat(300) + '.mp4').endsWith('.mp4'));
});

test('instagram: best image candidate by area, URL hint, or first on ties', () => {
  assert.equal(bestCandidate([{ url: 'a', width: 100, height: 100 }, { url: 'b', width: 1080, height: 1080 }]).url, 'b');
  assert.equal(bestCandidate([{ url: 'https://x/s480x480/a.jpg' }, { url: 'https://x/original.jpg' }, { url: 'https://x/s150x150/c.jpg' }]).url, 'https://x/original.jpg');
  assert.equal(bestCandidate([{ url: 'first' }, { url: 'second' }]).url, 'first');
});

const MASTER = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=426x240
a_240p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
a_1080p.m3u8
`;
const MEDIA = `#EXTM3U
#EXT-X-TARGETDURATION:4
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:4.000000,
a_000.ts
#EXTINF:3.500000,
a_001.ts
#EXT-X-ENDLIST
`;

test('hls: master playlist lists renditions best first with absolute urls', () => {
  assert.ok(isMasterPlaylist(MASTER));
  assert.ok(!isMasterPlaylist(MEDIA));
  const v = parseMasterPlaylist(MASTER, 'https://cdn.example/x/master.m3u8');
  assert.deepEqual(v.map((x) => x.height), [1080, 240]);
  assert.equal(v[0].url, 'https://cdn.example/x/a_1080p.m3u8');
});

test('hls: media playlist yields segments and duration', () => {
  const { segments, duration } = parseMediaPlaylist(MEDIA, 'https://cdn.example/x/a_240p.m3u8');
  assert.deepEqual(segments, ['https://cdn.example/x/a_000.ts', 'https://cdn.example/x/a_001.ts']);
  assert.equal(duration, 7.5);
});

test('hls: refuses encrypted and live streams', () => {
  assert.throws(() => parseMediaPlaylist(MEDIA.replace('#EXTINF:4', '#EXT-X-KEY:METHOD=AES-128,URI="k"\n#EXTINF:4'), 'https://x/p.m3u8'), /encrypted/);
  assert.throws(() => parseMediaPlaylist(MEDIA.replace('#EXT-X-ENDLIST', ''), 'https://x/p.m3u8'), /Live/);
});

test('mp4: fragmented output is flattened into a normal, playable MP4', async () => {
  const { readFileSync, writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { default: muxjs } = await import('mux.js');
  const { flattenFragmentedMp4 } = await import('../src/core/mp4-flatten.js');

  const transmuxer = new muxjs.mp4.Transmuxer();
  let init = null;
  const fragments = [];
  transmuxer.on('data', (o) => {
    init ??= o.initSegment;
    fragments.push(o.data);
  });
  transmuxer.push(new Uint8Array(readFileSync(new URL('./fixtures/tiny.ts', import.meta.url))));
  transmuxer.flush();

  const file = Buffer.concat(flattenFragmentedMp4(init, fragments).map((p) => Buffer.from(p)));

  // Layout: ftyp, moov, mdat. No moof boxes: nothing is left fragmented.
  const top = [];
  for (let i = 0; i + 8 <= file.length; i += file.readUInt32BE(i)) top.push(file.toString('latin1', i + 4, i + 8));
  assert.deepEqual(top, ['ftyp', 'moov', 'mdat']);

  // Optional end-to-end check when ffmpeg is installed (CI runners have it).
  const out = join(mkdtempSync(join(tmpdir(), 'omni-')), 'flat.mp4');
  writeFileSync(out, file);
  if (spawnSync('ffprobe', ['-version']).status !== 0) return;
  const probe = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,nb_read_frames:format=duration', '-of', 'json', out]);
  const info = JSON.parse(probe.stdout);
  assert.ok(Math.abs(Number(info.format.duration) - 2) < 0.15, `duration ${info.format.duration}`);
  assert.equal(Number(info.streams.find((s) => s.codec_type === 'video').nb_read_frames), 48);
  assert.ok(info.streams.some((s) => s.codec_type === 'audio'));
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-i', out, '-f', 'null', '-']).stderr.length, 0);
});

test('youtube: 4K falls back to AV1 in MP4 and formats from several clients merge', () => {
  const ok = (formats, adaptiveFormats) => ({ playabilityStatus: { status: 'OK' }, videoDetails: { videoId: 'x', title: 'T' }, streamingData: { formats, adaptiveFormats } });
  const merged = mergePlayerResponses([
    { playabilityStatus: { status: 'LOGIN_REQUIRED' } },
    ok([], [{ itag: 140, mimeType: 'audio/mp4; codecs="mp4a"', url: 'https://a/140', bitrate: 1 }, { itag: 137, mimeType: 'video/mp4; codecs="avc1"', url: 'https://a/137', height: 1080 }]),
    ok([{ itag: 18, mimeType: 'video/mp4; codecs="avc1"', url: 'https://b/18', height: 360 }],
      [{ itag: 401, mimeType: 'video/mp4; codecs="av01"', url: 'https://b/401', height: 2160 }, { itag: 313, mimeType: 'video/webm; codecs="vp9"', url: 'https://b/313', height: 2160 }, { itag: 140, mimeType: 'audio/mp4; codecs="mp4a"', url: 'https://b/140', bitrate: 1 }]),
  ]);
  const v = mediaItemsFromPlayer(merged)[0].variants;
  assert.deepEqual(v.map((x) => x.url), ['https://b/401', 'https://a/137', 'https://b/18']);
  assert.match(v[0].label, /^2160p · AV1/);
});
