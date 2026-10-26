import { mediaItem } from './media-item.js';

function mimeKind(mimeType) {
  if (!mimeType) return 'other';
  if (mimeType.startsWith('video')) return 'video';
  if (mimeType.startsWith('audio')) return 'audio';
  return 'other';
}

function extensionFor(mimeType, kind) {
  if (/webm/.test(mimeType || '')) return kind === 'audio' ? 'weba' : 'webm';
  return kind === 'audio' ? 'm4a' : 'mp4';
}

function labelFor(format, kind, hasAudio) {
  if (kind === 'audio') {
    const kbps = format.bitrate ? ` ${Math.round(format.bitrate / 1000)}kbps` : '';
    return `Audio only${kbps}`;
  }
  const h = format.height ? ` ${format.height}p` : '';
  return `Video${h}${hasAudio ? ' (with audio)' : ' (video only)'}`;
}

/**
 * Turn a YouTube player response into media items.
 *
 * Formats that only carry a `signatureCipher` are skipped: their URL is
 * unusable without the signature, which needs the player JS to decipher
 * (yt-dlp runs a JS interpreter for this). Only formats with a plain `url`
 * are offered, so every listed item can actually be downloaded.
 *
 * @param {any} player
 */
export function mediaItemsFromPlayer(player) {
  const streaming = player?.streamingData;
  if (!streaming) throw new Error('No streamingData in YouTube player response');

  const status = player.playabilityStatus?.status;
  if (status && status !== 'OK') {
    throw new Error(player.playabilityStatus.reason || `YouTube: ${status}`);
  }

  const videoId = player.videoDetails?.videoId || 'video';
  const progressive = new Set(streaming.formats || []);
  const all = [...(streaming.formats || []), ...(streaming.adaptiveFormats || [])];

  const usable = all
    .filter((f) => typeof f.url === 'string' && f.url.startsWith('http'))
    .map((f) => ({ f, kind: mimeKind(f.mimeType) }))
    .filter((x) => x.kind === 'video' || x.kind === 'audio')
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'video' ? -1 : 1;
      const pa = progressive.has(a.f) ? 1 : 0;
      const pb = progressive.has(b.f) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return (b.f.height || b.f.bitrate || 0) - (a.f.height || a.f.bitrate || 0);
    });

  if (!usable.length) {
    const ciphered = all.some((f) => f.signatureCipher || f.cipher);
    throw new Error(
      ciphered
        ? 'YouTube only offered signature-protected streams for this video (not supported yet).'
        : 'No downloadable streams found for this video.',
    );
  }

  // Adaptive lists repeat each height as avc/vp9/av1: keep one per height
  // (mp4/avc plays everywhere) and the best audio track per container.
  const isAvcMp4 = (f) => /mp4/.test(f.mimeType) && !/av01/.test(f.mimeType);
  const heights = new Set(usable.filter((u) => u.kind === 'video' && isAvcMp4(u.f)).map((u) => u.f.height));
  const seen = new Set();
  const trimmed = usable.filter(({ f, kind }) => {
    if (progressive.has(f)) return true;
    if (kind === 'video' && !isAvcMp4(f) && heights.has(f.height)) return false;
    const key = kind === 'video' ? `v${f.height}` : `a${isAvcMp4(f) ? 'mp4' : 'webm'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return trimmed.map(({ f, kind }) =>
    mediaItem({
      url: f.url,
      label: labelFor(f, kind, progressive.has(f)),
      kind,
      filename: `youtube-${videoId}-${f.itag}.${extensionFor(f.mimeType, kind)}`,
    }),
  );
}
