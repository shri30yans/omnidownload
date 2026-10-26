// Pure-function tests: node --test tests/unit.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaItemsFromPlayer } from '../src/core/youtube-streams.js';
import { mediaFromRedditJson, redditExternalUrl } from '../src/core/reddit-json.js';
import { shortcodeToMediaId, shortcodeFromInstagramUrl } from '../src/core/instagram-id.js';
import { bestCandidate, harvestInstagramGraphJson } from '../src/core/embed-media.js';
import { sanitizeFilename } from '../src/core/filename.js';

const fmt = (o) => ({ mimeType: 'video/mp4; codecs="avc1"', ...o });

test('youtube: skips signatureCipher formats, never builds unsigned urls', () => {
  const player = { playabilityStatus: { status: 'OK' }, videoDetails: { videoId: 'x' },
    streamingData: { adaptiveFormats: [fmt({ itag: 1, signatureCipher: 'url=https%3A%2F%2Fa&s=zz', height: 720 })] } };
  assert.throws(() => mediaItemsFromPlayer(player), /signature-protected/);
});

test('youtube: one video per height (prefers avc mp4), best audio, progressive first', () => {
  const player = { playabilityStatus: { status: 'OK' }, videoDetails: { videoId: 'x' }, streamingData: {
    formats: [fmt({ itag: 18, url: 'https://a/18', height: 360, audioQuality: 'AUDIO_QUALITY_LOW' })],
    adaptiveFormats: [
      { itag: 248, mimeType: 'video/webm; codecs="vp9"', url: 'https://a/248', height: 1080 },
      fmt({ itag: 137, url: 'https://a/137', height: 1080 }),
      fmt({ itag: 399, mimeType: 'video/mp4; codecs="av01"', url: 'https://a/399', height: 1080 }),
      { itag: 140, mimeType: 'audio/mp4; codecs="mp4a"', url: 'https://a/140', bitrate: 130000 },
    ] } };
  const items = mediaItemsFromPlayer(player);
  assert.deepEqual(items.map((i) => i.url), ['https://a/18', 'https://a/137', 'https://a/140']);
  assert.match(items[0].label, /with audio/);
  assert.match(items[1].label, /video only/);
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
