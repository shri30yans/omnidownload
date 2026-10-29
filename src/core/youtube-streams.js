import { sanitizeFilename } from './filename.js';
import { mediaItem } from './media-item.js';

const isVideo = (f) => /^video\//.test(f.mimeType || '');
const isAudio = (f) => /^audio\//.test(f.mimeType || '');
const isMp4 = (f) => /mp4/.test(f.mimeType || '');
const isAvc = (f) => /avc1/.test(f.mimeType || '');
const isAv1 = (f) => /av01/.test(f.mimeType || '');
const isWebm = (f) => /webm/.test(f.mimeType || '');
const hasUrl = (f) => typeof f.url === 'string' && f.url.startsWith('http');

const cleanTitle = (title, fallback) => sanitizeFilename(title || fallback, 100);

const sizeLabel = (bytes) => {
  const mb = Number(bytes) / 1e6;
  if (!mb) return '';
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.max(1, Math.round(mb))} MB`;
};

/** Best (highest bitrate) format of each kind. */
const best = (formats) => formats.reduce((a, b) => ((b.bitrate || 0) > (a?.bitrate || 0) ? b : a), null);

/**
 * One row per video, one row per audio track, no matter how many resolutions
 * YouTube offers. Resolutions are variants of the same row.
 *
 * Formats that only carry a `signatureCipher` are skipped: their URL is
 * unusable without the player JS. Video above 360p comes as a separate
 * video-only and audio-only stream; a variant with `audioUrl` is joined into
 * one MP4 at download time.
 *
 * @param {any} player merged player response
 */
export function mediaItemsFromPlayer(player) {
  const streaming = player?.streamingData;
  if (!streaming) throw new Error('No streamingData in YouTube player response');

  const status = player.playabilityStatus?.status;
  if (status && status !== 'OK') {
    throw new Error(player.playabilityStatus.reason || `YouTube: ${status}`);
  }

  const videoId = player.videoDetails?.videoId || 'video';
  const title = cleanTitle(player.videoDetails?.title, `youtube-${videoId}`);
  const previewUrl = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  const progressive = (streaming.formats || []).filter(hasUrl);
  const adaptive = (streaming.adaptiveFormats || []).filter(hasUrl);

  if (!progressive.length && !adaptive.length) {
    const ciphered = [...(streaming.formats || []), ...(streaming.adaptiveFormats || [])].some(
      (f) => f.signatureCipher || f.cipher,
    );
    throw new Error(
      ciphered
        ? 'YouTube only offered signature-protected streams for this video (not supported yet).'
        : 'No downloadable streams found for this video.',
    );
  }

  // Audio: best AAC (joins into MP4 and plays everywhere), plus best Opus as an extra choice.
  const aacAudio = best(adaptive.filter((f) => isAudio(f) && isMp4(f)));
  const opusAudio = best(adaptive.filter((f) => isAudio(f) && isWebm(f)));

  // Video: one entry per height. H.264 plays everywhere; heights it lacks (1440p, 4K)
  // fall back to AV1 in MP4. Both join into MP4; VP9/WebM cannot.
  const byHeight = new Map();
  for (const f of progressive.filter(isVideo)) byHeight.set(f.height, { f, joined: false });
  if (aacAudio) {
    for (const codec of [isAvc, isAv1]) {
      for (const f of adaptive.filter((x) => isVideo(x) && isMp4(x) && codec(x))) {
        if (!byHeight.has(f.height)) byHeight.set(f.height, { f, joined: true });
      }
    }
  }

  const variants = [...byHeight.entries()]
    .sort(([a], [b]) => b - a)
    .map(([height, { f, joined }]) => {
      const bytes = Number(f.contentLength || 0) + (joined ? Number(aacAudio.contentLength || 0) : 0);
      return {
        url: f.url,
        ...(joined ? { audioUrl: aacAudio.url, totalBytes: bytes } : {}),
        label: [`${height}p`, isAv1(f) ? 'AV1' : '', sizeLabel(bytes)].filter(Boolean).join(' · '),
        filename: `${title} ${height}p.mp4`,
      };
    });

  const items = [];
  if (variants.length) {
    items.push(
      mediaItem({
        url: variants[0].url,
        label: title,
        kind: 'video',
        filename: variants[0].filename,
        previewUrl,
        variants,
      }),
    );
  }

  const audioVariants = [
    [aacAudio, 'M4A', 'm4a'],
    [opusAudio, 'Opus', 'webm'],
  ]
    .filter(([f]) => f)
    .map(([f, name, ext]) => ({
      url: f.url,
      label: [name, f.bitrate ? `${Math.round(f.bitrate / 1000)}kbps` : '', sizeLabel(f.contentLength)]
        .filter(Boolean)
        .join(' · '),
      filename: `${title}.${ext}`,
    }));
  if (audioVariants.length) {
    items.push(
      mediaItem({
        url: audioVariants[0].url,
        label: `${title} (audio)`,
        kind: 'audio',
        filename: audioVariants[0].filename,
        previewUrl,
        variants: audioVariants,
      }),
    );
  }

  return items;
}
